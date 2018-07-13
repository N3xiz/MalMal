var port = process.env.PORT || 3000;
var express = require('express');
var app = express();
var path = require('path');
var server = app.listen(port, () => console.log('listening on port ' + port));
var io = require('socket.io').listen(server);
var fs = require('fs');

var playerQueue = [];


//Debug console messages
const DEBUG = true;

// Dir routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom
var numUsers = 0;

var cors = require('cors');
var bodyParser = require('body-parser');

app.use(cors());
app.use(bodyParser.json());

createJSONIfNotExist('./resources/words.json');
createJSONIfNotExist('./resources/highscores.json');
createJSONIfNotExist('./resources/highscores-sorted.json');

const words = require('./resources/words');
const highscores = require('./resources/highscores');
const highscoresSorted = require('./resources/highscores-sorted');


function createJSONIfNotExist(path) {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, '{}', function (err) {
            if (err) throw err;
        });
    }
}

function sortProperties(obj) {
    // convert object into array
    var sortable = [];
    for (var key in obj)
        if (obj.hasOwnProperty(key))
            sortable.push([key, obj[key]]); // each item is an array in format [key, value]

    // sort items by value
    sortable.sort(function (b, a) {
        //a
        return a[1] - b[1]; // compare numbers
    });

    var jsonhighscore = {"highscore": sortable};
    highscoresSorted["highscore"] = sortable;
    return jsonhighscore; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}

var gameRunning = false;
var drawingPlayer;

//Running game
function startGameEngine() {
    console.log("Trying to start Engine.");
    if (numUsers >= 2 && !gameRunning) {
        console.log("Engine started.");
        gameRunning = true;
        drawingPlayer = playerQueue.shift();
        console.log("Drawing Player: " + drawingPlayer.username);

        var randomWordsArray = Object.values(words);    //Getting words array
        var randomWord = randomWordsArray[Math.floor(Math.random() * randomWordsArray.length)];  //Choosing random word
        console.log("Random word choosen: " + randomWord)
        drawingPlayer.emit('chat_instruction', "Your word is: " + randomWord);

        playerQueue.forEach(function (element) {
            if (element != drawingPlayer) {
                element.emit('chat_instruction', "Guess the word!");
            }
        });


    }
}


//Stopps game
function stopGameEngine() {
    console.log("Game Stopped.");
    gameRunning = false;
    drawingPlayer = null;
    playerQueue.push(drawingPlayer);
}


app.get('/highscore', (req, res) => {
    res.status(200).json(highscoresSorted);
});


app.post('/highscore', (req, res) => {
    const newScore = req.body;

    for (let user in newScore) {
        if (Number.isInteger(newScore[user])) {
            if (!(highscores[user] > newScore[user])) highscores[user] = newScore[user];
            sortProperties(highscores);
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

/* OLD without chat, only drawing
function onConnection(socket){
    socket.on('drawing', (data) => socket.broadcast.emit('drawing', data));

}

io.on('connection', onConnection);
*/

io.on('connection', (socket) => {
    var addedUser = false;

    socket.on('drawing', (data) => socket.broadcast.emit('drawing', data));

    // when the client emits 'new message', this listens and executes
    socket.on('new message', (data) => {
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data
        });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', (username) => {
        if (addedUser) return;

        // we store the username in the socket session for this client
        socket.username = username;

        //Push User to User Queue
        playerQueue.push(socket);

        if (DEBUG == true) {
            console.log("Added to Queue: " + socket.username);
            playerQueue.forEach(function (element) {
                console.log(element.username);
            });
        }

        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers
        });
        // echo globally (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers
        });

        startGameEngine(); //Try to start game
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', {
            username: socket.username
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {

            //Remove User from queue
            playerQueue.splice(playerQueue.indexOf(socket), 1);
            if (DEBUG == true) {
                console.log("Removed from Queue: " + socket.username);
                playerQueue.forEach(function (element) {
                    console.log(element.username);
                });
            }
            --numUsers;

            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });
});
