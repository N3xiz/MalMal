const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');

const port = process.env.PORT || '3000';
app.set('port', port);

app.use(cors());
app.use(bodyParser.json());

const words = require('./resources/words');
const highscores = require('./resources/highscores');

app.use(function(err, req, res, next) {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).send(JSON.stringify({
            error: {
                code: "INVALID_JSON",
                message: "The body of your request is not valid JSON."
            }
        }))
    }
});

app.get('/highscore', (req, res) => {
    res.status(200).json(highscores);
});

app.post('/highscore', (req, res) => {
    const newScore = req.body;

    for (let user in newScore) {
        if (Number.isInteger(newScore[user])) {
            if (!(highscores[user] > newScore[user])) highscores[user] = newScore[user];
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
app.listen(port, () => {
    console.log('Listening on port ' + port);
});