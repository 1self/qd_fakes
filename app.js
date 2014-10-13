
/**
 * Module dependencies.
 */
var swig = require('swig');
var express = require('express'), routes = require('./routes');
var bodyParser = require('body-parser');
var fs = require('fs-extra');
var crypto = require('crypto');
var moment = require("moment");
var uuid = require('node-uuid');
var ObjectId = require('mongodb').ObjectID;
var _ = require('underscore');
var Q = require('q');

var app = express();

app.engine('html', swig.renderFile);
app.set('views', __dirname + '/views');
app.set('view engine', 'html');
app.use(bodyParser.urlencoded({ extended: true}));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

exports.app = app;

app.post('/v1/streams', function (req, res) {
    var appkey = req.headers.authorization;
    if(appkey === undefined){
      res.send(401);
    }

    var stream = {
        streamid: 1234567890,
        writeToken: "writetoken",
        readToken: "readtoken",
        appkey: appkey
    };
    var fileName = __dirname +'/fake_data/stream/'+stream.streamid;
    fs.ensureFile(fileName, function(err) {
        if(err){
            console.log(err); //null
        }else{
            fs.writeFile(fileName, JSON.stringify(stream, null, 4), function(err) {
                if(err) {
                    console.log(err);
                } else {
                    console.log("JSON saved to " + fileName);
                }
            });
        }
    });
    res.send(stream)
});
//TODO: not sure about the purpose ?
app.get('/v1/streams/:id', function (req, res) {
  var readToken = req.headers.authorization;
  var fileName = __dirname +'/fake_data/event/'+req.params.id;

  fs.readFile(fileName, 'utf8', function (err,data) {
        if (err){
          res.status(404).send("stream not found");
        }
        else{
          var stream = JSON.parse(data);
          if(stream.readToken != req.headers.authorization){
              res.status(404).send("stream not found");
          }
          else{
              var response = {
                                streamid: stream.streamid
                             };
              res.send(JSON.stringify(response));
          }
        }
  });
});

// some examples of what the events look like
// /v1/streams/:id/events/ambient;sound/sample/dba/sum/daily/barchart

// /v1/streams/:id/events/ambient;sound/sample/dba

// /v1/streams/:id/events/self/meet/duration/sum/daily/barchart
// /v1/streams/:id/events/self/exercise/duration/sum/daily/barchart
// /v1/streams/:id/events/teeth/floss/duration/sum/daily/barchart
// /v1/streams/:id/events/self/meditate/duration/sum/daily/barchart
// /v1/streams/:id/events/self/commute/duration/sum/daily/barchart
// /v1/streams/:id/events/self/sleep/duration/sum/daily/barchart
// /v1/streams/:id/events/self/party/duration/sum/daily/barchart
// /v1/streams/:id/events/self/code/duration/sum/daily/barchart
// /v1/streams/:id/events/tv/watch/duration/sum/daily/barchart
// /v1/streams/:id/events/self/write/duration/sum/daily/barchart
// /v1/streams/:id/events/self/interview/duration/sum/daily/barchart
// /v1/streams/:id/events/self/study/duration/sum/daily/barchart
// /v1/streams/:id/events/homework/do/duration/sum/daily/barchart
// /v1/streams/:id/events/dog/walk/duration/sum/daily/barchart
// /v1/streams/:id/events/chores/do/duration/sum/daily/barchart
// /v1/streams/:id/events/lifeadmin/do/duration/sum/daily/barchart
// /v1/streams/:id/events/ambientsound/sample/dba
// /v1/streams/:id/events/ambientsound/sample/raw

// /v1/users/edsykes/events/ambient;sound/sample     /dba /avg         /daily  /barchart
// /v1/users/edsykes/events/:objectTags  /:actionTag/:prop/:aggregation/:rollup/barchart


//app.get('/streams/:id/events/:objecttags/:actiontags/:value/:aggregation/:rollup/:visualization', function (req, res) {
  app.get('/streams/:id/events/:objecttags/:actiontags/:prop/:aggregation/:rollup/:visualization', function (req, res) {
  var readToken = req.headers.authorization;
  if(readToken=== undefined){
    readToken = req.query.readtoken;
  }
  var fileName = __dirname +'/fake_data/event/'+req.params.id;

  if(readToken != "readtoken"){
    res.send(401);
  }

  var params = {
    streamid: req.params.id,
    objecttags: req.params.objecttags,
    actiontags: req.params.actiontags,
    prop: req.params.prop,
    aggregation: req.params.aggregation,
    rollup: req.params.rollup, 
    visualization: req.params.visualization,
  }
  console.log(params);
  var body = "<html><body>" + JSON.stringify(params) + "</body></html>"
  res.send(body);
});

//TODO:clean it the way its done /batch
app.post('/v1/streams/:id/events', function (req, res) {
    var writeToken = req.headers.authorization;
    authenticateWriteToken(
      writeToken,
      req.params.id,
      function () {
          res.status(404).send("stream not found");
      },
      function (stream) {
          var parsedEvent = parseEvent(req.body, stream)
          saveEventToFile(parsedEvent,stream.streamid);
          res.send(JSON.stringify(parsedEvent))
      }
    );
 });

 app.post('/v1/streams/:id/batch', function(req,res){
   var writeToken = req.headers.authorization;
   var streamid = req.params.id;
   var events = req.body;
   var eventsToSend = [];

    findStreamById(streamid,function(err,stream){
        if(writeToken == stream.writeToken){
           var parsedEvents = parseEvents(events,stream);
            saveEventsToFile(parsedEvents,stream.streamid)
           .then(function(parsedEvents){
            res.send(JSON.stringify(parsedEvents));
           })
        }
    });
 });

 var saveEventsToFile = function(events,streamid){
    var deferred = Q.defer();
    _.each(events,function(event){
        saveEventToFile(event,streamid);
    });
    deferred.resolve(events);
    return deferred.promise;
 }

function parseEvents(events,stream){
    var parsedEvents = [];
    _.each(events,function(event){
         parsedEvents.push(parseEvent(event,stream));
    });
    return parsedEvents;
 }

app.get('/reset', function (req, res) {
   fs.remove(__dirname +'/fake_data', function(err){
     if (err) return console.error(err);
     res.send('Fakes reset complete!!');
   });
 });

var findStreamById = function(streamid,callback){
    var fileName = __dirname +'/fake_data/stream/'+streamid;
    fs.readFile(fileName, 'utf8', function (err,data) {
        callback(err,JSON.parse(data));
    });
}

var parseEvent = function(event, stream){
    var event = {
            _id : new ObjectId(),
            event : {
            createdOn : moment(new Date()).format(),
            id : uuid.v1()
                    },
            payload : {
                actionTags :event.actionTags,
                source : event.source,
                objectTags : event.objectTags,
            streamid : stream.streamid,
            properties : event.properties,
            eventDateTime : moment(new Date()).format()
        }
    }
    return event;
}

function saveEventToFile(event,streamid){
    var fileName = __dirname +'/fake_data/event/'+streamid+'/'+event._id;

    fs.ensureFile(fileName, function(err) {
        if(err){
            console.log(err);
        }else{
            fs.writeFile(fileName, JSON.stringify(event, null, 4), function(err) {
                if(err) {
                    console.log(err);
                } else {
                    console.log("JSON saved to " + fileName);
                }
            });
        }
    });
}

var authenticateWriteToken = function (token, id, error, success) {
    var fileName = __dirname +'/fake_data/stream/'+id;
    fs.readFile(fileName, 'utf8', function (err,data) {
        if (!err){
            var stream = JSON.parse(data);
            if(stream.writeToken != token){
                error()
            }
            else{
                success(stream);
            }
        }
        else{
            error()
        }
    });
};

function randomValueHex (len) {
    return crypto.randomBytes(Math.ceil(len/2))
        .toString('hex') // convert to hexadecimal format
        .slice(0,len);   // return required number of characters
}

function randomValueBase64 (len) {
    return crypto.randomBytes(Math.ceil(len * 3 / 4))
        .toString('base64')   // convert to base64 format
        .slice(0, len)        // return required number of characters
        .replace(/\+/g, '0')  // replace '+' with '0'
        .replace(/\//g, '0'); // replace '/' with '0'
}

var port = 7000;
app.listen(port, function () {
    console.log("Listening on " + port);
});