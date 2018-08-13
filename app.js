const Alice = require('yandex-dialogs-sdk');
const { json } = require('micro')
const alice = new Alice();
const _ = require("underscore");
const express = require('express');
const bodyParser = require('body-parser');
const PubSub = require('pubsub-js');
const Joi = require('joi');

//alexa code
const MessageModel = require('./bots-js-utils/lib/messageModel/MessageModel.js')(Joi);
const messageModelUtil = require('./bots-js-utils/lib/messageModel/messageModelUtil.js');
const botUtil = require('./bots-js-utils/lib/util/botUtil.js');
const webhookUtil = require('./bots-js-utils/lib/webhook/webhookUtil.js');
// end of alexa code


module.exports = function () {
  var self = this;
  var session;
  //alexa code
  var metadata = {
    allowConfigUpdate: true, //set to false to turn off REST endpoint of allowing update of metadata
    waitForMoreResponsesMs: 200,  //milliseconds to wait for additional webhook responses
    amzn_appId: "amzn1.ask.skill.b6a603ad-5f3f-471e-b509-922ddc2aded9",
    channelSecretKey: 'LwQzvS0GhRm19udjrmhKpjIBghSMrSZr',
    channelUrl: 'https://e87476aa.ngrok.io/connectors/v1/tenants/chatbot-tenant/listeners/webhook/channels/B9CB2CFE-8717-422C-8809-73AFD37D1894'
  };

  // expose this function to be stubbed
  this.sendWebhookMessageToBot = function (channelUrl, channelSecretKey, userId, messagePayload, additionalProperties, callback) {
    webhookUtil.messageToBotWithProperties(channelUrl, channelSecretKey, userId, messagePayload, additionalProperties, callback);
  };

  this.randomIntInc = function (low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
  };
  // end of alexa code

  this.init = function (config) {
    var app = express();
    var aliceRouter = express.Router();
    //aliceRouter.use(bodyParser.json());
    app.use('/', aliceRouter);
    var logger = (config ? config.logger : null);
    if (!logger) {
      logger = console;
    }
    console.log("inside init");

    //alexa code
    // compile the list of actions, global actions and other menu options
    function menuResponseMap(resp, card) {
      var responseMap = {};

      function addToMap(label, type, action) {
        responseMap[label] = { type: type, action: action };
      }

      if (!card) {
        if (resp.globalActions && resp.globalActions.length > 0) {
          resp.globalActions.forEach(function (gAction) {
            addToMap(gAction.label, 'global', gAction);
          });
        }
        if (resp.actions && resp.actions.length > 0) {
          resp.actions.forEach(function (action) {
            addToMap(action.label, 'message', action);
          });
        }
        if (resp.type === 'card' && resp.cards && resp.cards.length > 0) {
          resp.cards.forEach(function (card) {
            //special menu option to navigate to card detail
            addToMap('Card ' + card.title, 'card', { type: 'custom', value: { type: 'card', value: card } });
          });
        }
      } else {
        if (card.actions && card.actions.length > 0) {
          card.actions.forEach(function (action) {
            addToMap(action.label, 'message', action);
          });
        }
        //special menu option to return to main message from the card
        addToMap('Return', 'cardReturn', { type: 'custom', value: { type: 'messagePayload', value: resp } });
      }
      return responseMap;
    }

    app.post('/singleBotWebhook/messages', bodyParser.json({
      verify: webhookUtil.bodyParserRawMessageVerify
    }), function (req, res) {
      console.log('Inside singleBotWebhook post method');
      console.log('req.body');
      console.log(req.body);
      const userID = req.body.userId;
      if (!userID) {
        return res.status(400).send('Missing User ID');
      }
      if (webhookUtil.verifyMessageFromBot(req.get('X-Hub-Signature'), req.rawBody, req.encoding, metadata.channelSecretKey)) {
        res.sendStatus(200);
        logger.info("Publishing to", userID);
        PubSub.publish(userID, req.body);
      } else {
        res.sendStatus(403);
      }
    });
    // end of alexa code

    aliceRouter.get('/', bodyParser.json(), function (req, res) {
      console.log("inside /");
      res.send('im the home page!');
    });

    app.post('/alexa/app', bodyParser.json(), async (req, res) => {
      session = req.body.session;
      const handleResponseCallback = response => res.send(response);
      const replyMessage = await alice.handleRequestBody(req.body, handleResponseCallback);
    });

    alice.any(ctx => {
      console.log('This is test to check');
      aliceHandler(ctx);
      //ctx.reply('This is any Alice method');
    });

    var aliceHandler = function (ctx) {
      var userId;
      var command = ctx.message;
      if (!userId) {
        userId = '33c0bcBc8e-378c-4496-bc2a-b2b9647de2317'; //self.randomIntInc(1000000, 9999999).toString();
        session.userId = userId;
      }
      const replyMessage = ctx.replyBuilder;

      if (metadata.channelUrl && metadata.channelSecretKey && userId && command) {
        const userIdTopic = userId;
        var respondedToAlexa = false;
        var additionalProperties = {
          "profile": {
            "clientType": "alexa"
          }
        };

        var sendToAlexa = function (resolve, reject) {
          if (!respondedToAlexa) {
            respondedToAlexa = true;
            logger.info('Prepare to send to Alexa');
            //alexa_res.send();
            resolve();
            PubSub.unsubscribe(userIdTopic);
          } else {
            logger.info("Already sent response");
          }
        };// End of sendToAlexa

        var navigableResponseToAlexa = function (resp) {
          var respModel;
          if (resp.messagePayload) {
            respModel = new MessageModel(resp.messagePayload);
          } else {
            // handle 1.0 webhook format as well
            respModel = new MessageModel(resp);
          }

          var botMessages = session.botMessages;
          if (!Array.isArray(botMessages)) {
            botMessages = [];
          }

          var botMenuResponseMap = session.botMenuResponseMap;
          if (typeof botMenuResponseMap !== 'object') {
            botMenuResponseMap = {};
          }
          botMessages.push(respModel.messagePayload());
          session.botMessages = botMessages;
          session.botMenuResponseMap = Object.assign(botMenuResponseMap || {}, menuResponseMap(respModel.messagePayload()));
          let messageToAlexa = messageModelUtil.convertRespToText(respModel.messagePayload());
          logger.info("Message to Alexa (navigable):", messageToAlexa);
          replyMessage.text(messageToAlexa);
          ctx.reply(replyMessage.get());
        };// End of navigableResponseToAlexa

        var sendMessageToBot = function (messagePayload) {
          logger.info('Creating new promise for', messagePayload);
          return new Promise(function (resolve, reject) {
            var commandResponse = function (msg, data) {
              logger.info('Received callback message from webhook channel');
              var resp = data;
              logger.info('Parsed Message Body:', resp);
              if (!respondedToAlexa) {
                navigableResponseToAlexa(resp);
              } else {
                logger.info("Already processed response");
                return;
              }
              if (metadata.waitForMoreResponsesMs) {
                _.delay(function () {
                  sendToAlexa(resolve, reject);
                }, metadata.waitForMoreResponsesMs);
              } else {
                sendToAlexa(resolve, reject);
              }
            }; // End of commandResponse

            var token = PubSub.subscribe(userIdTopic, commandResponse);
            self.sendWebhookMessageToBot(metadata.channelUrl, metadata.channelSecretKey, userId, messagePayload, additionalProperties, function (err, response) {
              if (err) {
                logger.info("Failed sending message to Bot");
                //alexa_res.say("Failed sending message to Bot.  Please review your bot configuration.");
                replyMessage.text("Failed sending message to Bot.  Please review your bot configuration.");
                // replyMessage.shouldEndSession(false);
                ctx.reply(replyMessage.get());
                reject();
                PubSub.unsubscribe(userIdTopic);
              } else {
                console.log('Inside self.sendWebhookMessageToBot');
                console.log(response);
              }
            });
          });

        }; // End of sendMessageToBot

        var handleInput = function (input) {
          // var botMenuResponseMap = session.botMenuResponseMap;
          // if (typeof botMenuResponseMap !== 'object') {
          //   botMenuResponseMap = {};
          // }
          //var menuResponse = botUtil.approxTextMatch(input, _.keys(botMenuResponseMap), true, true, 7);
          var botMessages = ctx.message;
          var commandMsg = MessageModel.textConversationMessage(command);

          return sendMessageToBot(commandMsg);
        }

        return handleInput(command);



      }//End of If Condition
      else {
        _.defer(function () {
          replyMessage.text(' Are you from England? ');
          return ctx.reply(replyMessage.get());
        });
      }



      // replyMessage.shouldEndSession(false);
      // replyMessage.text(' Are you from England? ');
      // return ctx.reply(replyMessage.get());


    }// End of Alice Handler




    app.locals.endpoints = [];
    app.locals.endpoints.push({
      name: 'webhook',
      method: 'POST',
      endpoint: '/singleBotWebhook/messages'
    });
    app.locals.endpoints.push({
      name: 'alexa',
      method: 'POST',
      endpoint: '/alexa/app'
    });

    return app;



  };

  return this;


}();