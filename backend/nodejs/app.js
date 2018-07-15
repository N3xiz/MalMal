'use strict';

var port = process.env.PORT || 3000;
var express = require('express');
var app = express();
var path = require('path');
var server = app.listen(port, () => logMessage('listening on port ' + port));
var io = require('socket.io').listen(server);
var fs = require('fs');

var cors = require('cors');
var bodyParser = require('body-parser');

app.use(cors());
app.use(bodyParser.json());

// Creating JSON files for word list and highscores if they don't exist
createJSONIfNotExist('./resources/words.json');
createJSONIfNotExist('./resources/highscores.json');

// Requiring JSONs
var words = require('./resources/words');
var highscores = require('./resources/highscores');
var highscoresSorted = sortProperties(highscores);

//Debug console messages
const DEBUG = true;

//Game Variables
const ROUNDTIME = 60; // 60 seconds per round
var playerQueue = []; // Player
var canvasData = []; // Canvas content
var regXp;  // Regular Expression for guess word
var randomWord; // Choosen word
var roundTimer; // Round Timer
var timeRemaining; // Remaining time in round
var currentPublicInstruction = ""; // Public instruction for players (except drawer)
var gameRunning = false; // Is the game currently running?
var drawingPlayer; // The currently drawing player

// Dir routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom
var numUsers = 0;

// DEBUG console messages
function logMessage(data) {
    if (DEBUG) {
        console.log("[" + new Date().toISOString() + "][DEBUG] " + data);
    }
}

// Creates the file if it doesn't exist
function createJSONIfNotExist(path) {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, '{}', function (err) {
            if (err) throw err;
        });
    }
}

// Sort the highscores
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
    return {"highscore": sortable}; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}

// Try to start a new round (only if players >= 2)
function startGameEngine() {
    logMessage("Trying to start Engine.");
    if (numUsers >= 2 && !gameRunning) {
        logMessage("Engine started.");
        gameRunning = true;
        drawingPlayer = playerQueue.shift();
        logMessage("Drawing Player: " + drawingPlayer.username);

        var randomWordsArray = Object.values(words);    //Getting words array
        randomWord = randomWordsArray[Math.floor(Math.random() * randomWordsArray.length)];  //Choosing random word

        //Create RegExp for finding the word in the chat
        regXp = new RegExp("\\b" + randomWord + "\\b", "i"); //search for standalone word, case-insensitive

        logMessage("Random word chosen: " + randomWord);

        //Getting the word to the Drawer and unlocking canvas
        drawingPlayer.emit('canvas_unlock', true);
        currentPublicInstruction = "Guess the word!";
        drawingPlayer.emit('instruction_box', "Draw the word: " + randomWord);
        playerQueue.forEach(function (element) {
            element.emit('instruction_box', currentPublicInstruction);
        });
        initializeCountdown();
    } else {
        logMessage("Not enough Players or game already running!");
    }
}

// Round timer handling, if the rimer runs out stopGameEngine is called with null (no one guessed correctly)
function initializeCountdown() {
    timeRemaining = ROUNDTIME;
    roundTimer = setInterval(function () {
        timeRemaining -= 1;
        if (gameRunning) {
            if (timeRemaining < -1) {
                clearInterval(roundTimer);
                stopGameEngine();
            } else {
                playerQueue.forEach(function (element) {
                    element.emit('timer', timeRemaining);
                });
                drawingPlayer.emit('timer', timeRemaining);
                logMessage("Countdown: " + timeRemaining);
            }
        } else {
            clearInterval(roundTimer);
        }
    }, 1000);
}


// Stop the current game, correctGuessPlayer = player that guessed the word. If correctGuessPlayer == null, nobody guessed the word
function stopGameEngine(correctGuessPlayer) {
    logMessage("Game Stopped.");
    if (correctGuessPlayer != null) {
        // Somebody guessed the word (correctGuessPlayer != null)
        var points = timeRemaining; // Points are the time remaining on the round timer
        playerQueue.forEach(function (element) {
            element.emit('chat_instruction', "Round over! " + drawingPlayer.username + " earned " + points + " points.");
            element.emit('chat_instruction', correctGuessPlayer.username + " Guessed the word: " + randomWord + " correctly\n" +
                "and earned " + points + " points.");
        });
        drawingPlayer.emit('chat_instruction', "Round over! You've earned " + points + " points.");
        drawingPlayer.emit('chat_instruction', correctGuessPlayer.username + " Guessed the word: " + randomWord + " correctly\n" +
            "and earned " + points + " points.");

        // Point rollout and highscores
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

        // Sorting highscores
        highscoresSorted = sortProperties(highscores);

        // Writing highscores
        fs.writeFileSync('./resources/highscores.json', JSON.stringify(highscores), function (err) {
            if (err) throw err;
        });
    } else {
        // No one guessed the word (correctGuessPlayer == null)
        playerQueue.forEach(function (element) {
            element.emit('chat_instruction', "No one guessed the word " + randomWord + " Nobody earns points.");
        });
        if (drawingPlayer != null) {
            drawingPlayer.emit('chat_instruction', "No one guessed the word " + randomWord + " Nobody earns points.");
        }
    }

    // Put the drawing player back in the player queue (if he's not disconnected yet)
    if (drawingPlayer != null) {
        playerQueue.push(drawingPlayer);
    }
    drawingPlayer = null;
    gameRunning = false;
    clearInterval(roundTimer);
    canvasData = []; // Empty canvas data

    // Resetting Instruction box, timer and locking and clearing canvas
    currentPublicInstruction = "Round over.";
    playerQueue.forEach(function (element) {
        element.emit('instruction_box', currentPublicInstruction);
        element.emit('timer', -1);
        element.emit('canvas_unlock', false);
        element.emit('canvas_clear');
    });

    // Start new game if there is enough players
    if (numUsers >= 2) {
        startGameEngine();
    }
}

// RegEx test on chat messages, stopping game if word is found
function checkWord(player, data) {
    if (regXp.test(data) && !(player === drawingPlayer)) {
        stopGameEngine(player);
    }
}

// Sending canvas data to clients that request it or are given it (eg. on resize or newly connected)
function sendCanvasData(socket) {
    canvasData.forEach(function (data) {
        socket.emit('drawing', data)
    });
}

// GETs highscores
app.get('/highscore', (req, res) => {
    res.status(200).json(highscoresSorted);
});

// POSTs highscores
app.post('/highscore', (req, res) => {
    const newScore = req.body;

    for (let user in newScore) {
        if (Number.isInteger(newScore[user])) {
            if (!(highscores[user] > newScore[user])) highscores[user] = newScore[user];
            highscoresSorted = sortProperties(highscores);
        }

        else {
            res.status(400).json({message: 'The score for ' + user + ' is not an Integer'});
            return;
        }

    }

    fs.writeFileSync('./resources/highscores.json', JSON.stringify(highscores), function (err) {
        if (err) throw err;
    });

    res.status(200).json({message: 'Data has been successfully added'});
});

// GETs words
app.get('/words', (req, res) => {
    res.status(200).json(words);
});

// PUTs add-word (to add words to list, why not "put" on "words"?!)
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
            if (words[existingWord] === wordArray[newWord]) {
                isDuplicate = true;
                logMessage(wordArray[newWord] + " is duplicate.");
            }
        }


        // If not a duplicate, add it to the array
        if (isDuplicate) {
            logMessage(wordArray[newWord] + ' is a duplicate or has whitespaces.');
        }

        else {
            words.push(wordArray[newWord]);
            logMessage("Added Word: " + wordArray[newWord]);
        }
    }

    // Writing words to JSON file
    fs.writeFileSync('./resources/words.json', JSON.stringify(words), function (err) {
        if (err) throw err;
    });

    res.status(200).json({message: 'Data has been successfully added'})
});

// ---START OF SOCKET IMPLEMENTATION---
io.on('connection', (socket) => {
    var addedUser = false;

    // Player is drawing
    socket.on('drawing', (data) => {
        canvasData.push(data);
        socket.broadcast.emit('drawing', data)
    });

    // When the client emits 'new message', this listens and executes
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

    // When the client emits 'add user', this listens and executes
    socket.on('add_user', (username) => {
        if (addedUser) return;

        // we store the username in the socket session for this client
        socket.username = username;

        //Push User to User Queue
        playerQueue.push(socket);

        // Log player queue to console
        if (DEBUG) {
            logMessage("Added to Queue: " + socket.username);
            playerQueue.forEach(function (element) {
                logMessage(element.username);
            });
        }

        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers
        });
        // Echo globally (all clients) that a person has connected
        socket.broadcast.emit('user_joined', {
            username: socket.username,
            numUsers: numUsers
        });

        startGameEngine(); // Try to start game

        // Send canvas conent to newly connected players (important if game is already running)
        sendCanvasData(socket);
        // Send public instruction to newly connected (important if game is already running)
        socket.emit('instruction_box', currentPublicInstruction);
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
                logMessage("Drawer disconnected!");
                playerQueue.forEach(function (element) {
                    element.emit('chat_instruction', "The drawer disconnected.");
                });
                drawingPlayer = null;
                stopGameEngine();
            } else {
                playerQueue.splice(playerQueue.indexOf(socket), 1);
                if (DEBUG) {
                    logMessage("Removed from Queue: " + socket.username);
                    playerQueue.forEach(function (element) {
                        logMessage(element.username);
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
