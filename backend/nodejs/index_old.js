var app = require('express')();
var server = app.listen(3000);
var io = require('socket.io').listen(server);
var cors = require('cors');
var bodyParser = require('body-parser');

const port = process.env.PORT || '3000';
app.set('port', port);

app.use(cors());
app.use(bodyParser.json());

const words = require('./resources/words');
const highscores = require('./resources/highscores');
const highscoresSorted = require('./resources/highscores-sorted');

app.use(function (err, req, res, next) {

});

function sortProperties(obj) {
    // convert object into array
    var sortable = [];
    for (var key in obj)
        if (obj.hasOwnProperty(key))
            sortable.push([key, obj[key]]); // each item is an array in format [key, value]

    // sort items by value
    sortable.sort(function (b, a) {
        return a[1] - b[1]; // compare numbers
    });

    var jsonhighscore = {"highscore": sortable};
    highscoresSorted["highscore"] = sortable;
    return jsonhighscore; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}


app.get('/highscore', (req, res) => {
    res.status(200).json(highscoresSorted);
});


app.post('/highscore', (req, res) => {
    const newScore = req.body;

    for (let user in newScore) {
        if (Number.isInteger(newScore[user])) {
            if (!(highscores[user] > newScore[user])) highscores[user] = newScore[user];
            sortProperties(highscores)
        }

        else {
            res.status(400).json({message: 'The score for ' + user + ' is not an Integer'});
            return;
        }

    }


    res.status(200).json({message: 'Data has been successfully added'});
});

app.get('/words', (req, res) => {
    res.status(200).json(words);
});

app.put('/add-word', (req, res) => {
    const wordArray = req.body;

    // Check if data is an array
    if (!Array.isArray(wordArray)) {
        res.status(400).json({message: 'Data must be a JSON array'});
        return;
    }

    for (let newWord in wordArray) {
        // Check if data is in String format
        if (typeof wordArray[newWord] !== 'string') {
            res.status(400).json({message: 'Data in array must be Strings'});
            return;
        }

        let isDuplicate = false;

        // Check if word already exists
        for (let existingWord in words) {
            if (words[existingWord] === wordArray[newWord]) isDuplicate = true;
        }

        // If not a duplicate, add it to the array
        if (isDuplicate) console.log(wordArray[newWord] + ' is a duplicate');
        else words.push(wordArray[newWord]);
    }

    res.status(200).json({message: 'Data has been successfully added'})
});

/**
 * Start listening
 */

function onConnection(socket){
    socket.on('drawing', (data) => socket.broadcast.emit('drawing', data));
}

io.on('connection', onConnection);
