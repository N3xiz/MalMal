var port = process.env.PORT || 3000;
var express = require('express');
var app = express();
var path = require('path');
var server = app.listen(port, () => console.log('listening on port ' + port));
var io = require('socket.io').listen(server);
var fs = require('fs');

//Game Vards
var playerQueue = [];
var canvasData = [];
var regxp;
var randomWord;
const ROUNDTIME = 60; //60 seconds per round
var roundTimer;
var timeremaining;

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
        randomWord = randomWordsArray[Math.floor(Math.random() * randomWordsArray.length)];  //Choosing random word

        //Create RegExp for finding the word in the chat
        regxp = new RegExp("\\b" + randomWord + "\\b", "i"); //search for standalone word, case-insensitive

        console.log("Random word choosen: " + randomWord);

        //Getting the word to the Drawer and unlocking canvas
        drawingPlayer.emit('canvas_unlock', true);
        drawingPlayer.emit('instruction_box', "Draw the word: " + randomWord);
        playerQueue.forEach(function (element) {
            element.emit('instruction_box', "Guess the word!");
        });

        initializeCountdown();
    } else {
        console.log("Not enough Players or game already running!");
    }

}

//Stopps game
function stopGameEngine(correctGuessPlayer) {
    console.log("Game Stopped.");
    if (correctGuessPlayer != null) {
        var points = timeremaining;
        playerQueue.forEach(function (element) {
            element.emit('chat_instruction', "Round over! " + drawingPlayer.username + " earned " + points + " points.");
            element.emit('chat_instruction', correctGuessPlayer.username + " Guessed the word: " + randomWord + " correctly\n" +
                "and earned " + points + " points.");
        });
        drawingPlayer.emit('chat_instruction', "Round over! You've earned " + points + " points.");
        drawingPlayer.emit('chat_instruction', correctGuessPlayer.username + " Guessed the word: " + randomWord + " correctly\n" +
            "and earned " + points + " points.");

        if (highscores.hasOwnProperty(correctGuessPlayer.username)) {
            highscores[correctGuessPlayer.username] = highscores[correctGuessPlayer.username] + points;
        } else {
            highscores[correctGuessPlayer.username] = points;
        }

        if (highscores.hasOwnProperty(drawingPlayer.username)) {
            highscores[drawingPlayer.username] = highscores[drawingPlayer.username] + points;
        } else {
            highscores[drawingPlayer.username] = points;
        }

        sortProperties(highscores);

        fs.writeFileSync('./resources/highscores.json', JSON.stringify(highscores), function (err) {
            if (err) throw err;
        });

        fs.writeFileSync('./resources/highscores-sorted.json', JSON.stringify(highscoresSorted), function (err) {
            if (err) throw err;
        });
    } else {
        playerQueue.forEach(function (element) {
            element.emit('chat_instruction', "No one guessed the word " + randomWord + " Nobody earns points.");
        });
        drawingPlayer.emit('chat_instruction', "No one guessed the word " + randomWord + " Nobody earns points.");
    }

    if (drawingPlayer != null) {
        playerQueue.push(drawingPlayer);
    }
    drawingPlayer = null;
    gameRunning = false;
    clearInterval(roundTimer);
    canvasData = []; //Empty picture


    //Resetting Instruction box, timer and locking canvas.
    playerQueue.forEach(function (element) {
        element.emit('instruction_box', "Round over.");
        element.emit('timer', -1);
        element.emit('canvas_unlock', false);
        element.emit('canvas_clear');
    });

    if (numUsers >= 2) {
        startGameEngine();
    }
}

function checkWord(player, data) {
    if (regxp.test(data) && !(player === drawingPlayer)) {
        stopGameEngine(player);
    }
}

function sendCanvasData(socket){
    canvasData.forEach(function (data) {
        socket.emit('drawing', data)
    });
}

function initializeCountdown() {
    timeremaining = ROUNDTIME;
    roundTimer = setInterval(function () {
        timeremaining -= 1;
        if (gameRunning) {
            if (timeremaining < -1) {
                clearInterval(roundTimer);
                stopGameEngine();
            } else {
                playerQueue.forEach(function (element) {
                    element.emit('timer', timeremaining);
                });
                drawingPlayer.emit('timer', timeremaining);
                console.log("Countdown: " + timeremaining);
            }
        } else {
            clearInterval(roundTimer);
        }
    }, 1000);
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

    fs.writeFileSync('./resources/highscores.json', JSON.stringify(highscores), function (err) {
        if (err) throw err;
    });

    fs.writeFileSync('./resources/highscores-sorted.json', JSON.stringify(highscoresSorted), function (err) {
        if (err) throw err;
    });

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
            if (words[existingWord] === wordArray[newWord]){
                isDuplicate = true;
                console.log(wordArray[newWord] + " is duplicate.");
            }
        }


        // If not a duplicate, add it to the array
        if (isDuplicate) {
            console.log(wordArray[newWord] + ' is a duplicate or has whitespaces.');
        }

        else {
            words.push(wordArray[newWord]);
            console.log("Added Word: " + wordArray[newWord]);
        }
    }

    fs.writeFileSync('./resources/words.json', JSON.stringify(words), function (err) {
        if (err) throw err;
    });

    res.status(200).json({message: 'Data has been successfully added'})
});

//START OF SOCKET IMPLEMENTATION

io.on('connection', (socket) => {
    var addedUser = false;

    socket.on('drawing', (data) => {
        canvasData.push(data);
        socket.broadcast.emit('drawing', data)
    });

    // when the client emits 'new message', this listens and executes
    socket.on('new_message', (data) => {

        // we tell the client to execute 'new message'
        socket.broadcast.emit('new_message', {
            username: socket.username,
            message: data
        });

        //Check chat for correct word
        if (gameRunning) {
            checkWord(socket, data);
        }
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add_user', (username) => {
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
        socket.broadcast.emit('user_joined', {
            username: socket.username,
            numUsers: numUsers
        });

        startGameEngine(); //Try to start game

        sendCanvasData(socket);
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop_typing', () => {
        socket.broadcast.emit('stop_typing', {
            username: socket.username
        });
    });

    // request canvas data
    socket.on('get_canvas', () => {
        sendCanvasData(socket);
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {
            --numUsers;
            //Remove User from queue and stop if its the drawer
            if (socket === drawingPlayer) {
                console.log("Drawer disconnected!");
                playerQueue.forEach(function (element) {
                    element.emit('chat_instruction', "The drawer disconnected.");
                });
                stopGameEngine();
            } else {
                playerQueue.splice(playerQueue.indexOf(socket), 1);
                if (DEBUG == true) {
                    console.log("Removed from Queue: " + socket.username);
                    playerQueue.forEach(function (element) {
                        console.log(element.username);
                    });
                }
            }

            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });
});
