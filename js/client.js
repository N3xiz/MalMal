'use strict';

document.addEventListener("DOMContentLoaded", function () {

    // Object handles
    var socket = io('http://localhost:3000');
    var canvas = document.getElementsByClassName('whiteboard')[0];
    var colors = document.getElementsByClassName('colors');
    var context = canvas.getContext('2d');
    var canvasRect = canvas.getBoundingClientRect();

    // Current color, default = black
    var current = {
        color: 'black'
    };

    // Is currently drawing?
    var drawing = false;

    // Mouse listerners
    canvas.addEventListener('mousedown', onMouseDown, false);
    canvas.addEventListener('mouseup', onMouseUp, false);
    canvas.addEventListener('mouseout', onMouseUp, false);
    canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false);

    // Color picker boxes
    for (var i = 0; i < colors.length; i++) {
        colors[i].addEventListener('click', onColorUpdate, false);
    }

    // Drawing event
    socket.on('drawing', onDrawingEvent);

    // Resize event
    window.addEventListener('resize', onResize, false);
    onResize();

    var allowedToDraw = false; // Canvas unlocked?

    // Canvas draw handling
    function drawLine(x0, y0, x1, y1, color, emit) {
        context.beginPath();
        context.moveTo(x0, y0);
        context.lineTo(x1, y1);
        context.strokeStyle = color;
        context.lineWidth = 5;
        context.stroke();
        context.closePath();

        if (!emit) {
            return;
        }

        var w = canvas.width;
        var h = canvas.height;

        // Draw socket
        socket.emit('drawing', {
            x0: x0 / w,
            y0: y0 / h,
            x1: x1 / w,
            y1: y1 / h,
            color: color
        });
    }

    // ---Mouse movements for drawing---
    function onMouseDown(e) {
        if (allowedToDraw) {
            drawing = true;
        } else {
            drawing = false;
        }

        current.x = e.clientX - canvasRect.left;
        current.y = e.clientY - canvasRect.top;
    }

    function onMouseUp(e) {
        if (!drawing) {
            return;
        }
        drawing = false;
        drawLine(current.x, current.y, e.clientX - canvasRect.left, e.clientY - canvasRect.top, current.color, true);
    }

    function onMouseMove(e) {
        if (!drawing) {
            return;
        }
        drawLine(current.x, current.y, e.clientX - canvasRect.left, e.clientY - canvasRect.top, current.color, true);
        current.x = e.clientX - canvasRect.left;
        current.y = e.clientY - canvasRect.top;
    }

    // Color picker
    function onColorUpdate(e) {
        current.color = e.target.className.split(' ')[1];
    }

    // limit the number of events per second
    function throttle(callback, delay) {
        var previousCall = new Date().getTime();
        return function () {
            var time = new Date().getTime();

            if ((time - previousCall) >= delay) {
                previousCall = time;
                callback.apply(null, arguments);
            }
        };
    }

    // Drawing event wrap
    function onDrawingEvent(data) {
        var w = canvas.width;
        var h = canvas.height;
        drawLine(data.x0 * w, data.y0 * h, data.x1 * w, data.y1 * h, data.color);
    }

    // Canvas resize handling
    function onResize() {
        canvasRect = canvas.getBoundingClientRect();
        canvas.width = $('#canvasParent').width();
        canvas.height = $('#canvasParent').height();
        // Get canvas data from backend
        socket.emit('get_canvas');
    }

    // ---Chat---

    // Chat variables
    var FADE_TIME = 150; // ms
    var TYPING_TIMER_LENGTH = 400; // ms
    var COLORS = [
        '#e21400', '#91580f', '#f8a700', '#f78b00',
        '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
        '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
    ];

    // Initialize variables
    var $window = $(window);
    var $messages = $('#messages'); // Messages area
    var $inputMessage = $('#inputMessage'); // Input message input box


    // Prompt for setting a username
    var username;
    var connected = false;
    var typing = false;
    var lastTypingTime;
    var $currentInput = $('#usernameInput').focus();

    // Participants message in chat
    const addParticipantsMessage = (data) => {
        var message = '';
        if (data.numUsers === 1) {
            message += "there's 1 participant";
        } else {
            message += "there are " + data.numUsers + " participants";
        }
        log(message);
    }

    // Modal handling and username regex and set
    $('#usernameModal').on('hide.bs.modal', function (e) {
        if (!/^[a-zA-Z0-9]+$/.test($('#usernameInput').val())) {
            e.preventDefault();
            alert("Bitte gültigen Benutzernamen eingeben!");
        } else {
            setUsername();
        }
    });

    // Sets the client's username
    const setUsername = () => {
        username = cleanInput($('#usernameInput').val().trim());

        console.log("set username " + username);

        // If the username is valid
        if (username) {
            $currentInput = $inputMessage.focus();

            // Tell the server your username
            socket.emit('add_user', username);
        }
    }

    // Sends a chat message
    const sendMessage = () => {
        var message = $inputMessage.val();
        // Prevent markup from being injected into the message
        message = cleanInput(message);
        // if there is a non-empty message and a socket connection
        if (message && connected) {
            $inputMessage.val('');
            addChatMessage({
                username: username,
                message: message
            });
            // tell server to execute 'new message' and send along one parameter
            socket.emit('new_message', message);
        }
    }

    // Log a message
    const log = (message, options) => {
        var $el = $('<li>').addClass('log').text(message);
        addMessageElement($el, options);
    }

    // Adds the visual chat message to the message list
    const addChatMessage = (data, options) => {
        // Don't fade the message in if there is an 'X was typing'
        var $typingMessages = getTypingMessages(data);
        options = options || {};
        if ($typingMessages.length !== 0) {
            options.fade = false;
            $typingMessages.remove();
        }

        var formattedUsername;
        if (options.typingMessage) {
            formattedUsername = data.username + ' ';
        } else {
            formattedUsername = data.username + ': ';
        }

        var $usernameDiv = $('<span class="username"/>')
            .text(formattedUsername)
            .css('color', getUsernameColor(data.username));

        var $messageBodyDiv = $('<span class="messageBody">')
            .text(data.message);

        var typingClass = data.typing ? 'typing' : '';
        var $messageDiv = $('<li class="message"/>')
            .data('username', data.username)
            .addClass(typingClass)
            .append($usernameDiv, $messageBodyDiv);

        addMessageElement($messageDiv, options);
    }

    // Adds the visual chat typing message
    const addChatTyping = (data) => {
        data.typing = true;
        data.message = 'is typing';
        addChatMessage(data, {'typingMessage': true});
    }

    // Removes the visual chat typing message
    const removeChatTyping = (data) => {
        getTypingMessages(data).fadeOut(() => {
            $(this).remove();
        });
    }

    // Adds a message element to the messages and scrolls to the bottom
    // el - The element to add as a message
    // options.fade - If the element should fade-in (default = true)
    // options.prepend - If the element should prepend
    //   all other messages (default = false)
    const addMessageElement = (el, options) => {
        var $el = $(el);

        // Setup default options
        if (!options) {
            options = {};
        }
        if (typeof options.fade === 'undefined') {
            options.fade = true;
        }
        if (typeof options.prepend === 'undefined') {
            options.prepend = false;
        }

        // Apply options
        if (options.fade) {
            $el.hide().fadeIn(FADE_TIME);
        }
        if (options.prepend) {
            $messages.prepend($el);
        } else {
            $messages.append($el);
        }
        $messages[0].scrollTop = $messages[0].scrollHeight;
    }

    // Prevents input from having injected markup
    const cleanInput = (input) => {
        return $('<div/>').text(input).html();
    }

    // Updates the typing event
    const updateTyping = () => {
        if (connected) {
            if (!typing) {
                typing = true;
                socket.emit('typing');
            }
            lastTypingTime = (new Date()).getTime();

            setTimeout(() => {
                var typingTimer = (new Date()).getTime();
                var timeDiff = typingTimer - lastTypingTime;
                if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
                    socket.emit('stop_typing');
                    typing = false;
                }
            }, TYPING_TIMER_LENGTH);
        }
    }

    // Gets the 'X is typing' messages of a user
    const getTypingMessages = (data) => {
        return $('.typing.message').filter((i, element) => {
            return $(element).data('username') === data.username;
        });
    }

    // Gets the color of a username through hash function
    const getUsernameColor = (username) => {
        // Compute hash code
        var hash = 7;
        for (var i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + (hash << 5) - hash;
        }
        // Calculate color
        var index = Math.abs(hash % COLORS.length);
        return COLORS[index];
    }

    // Keyboard events
    $window.keydown(event => {
        // Auto-focus the current input when a key is typed
        if (!(event.ctrlKey || event.metaKey || event.altKey)) {
            $currentInput.focus();
        }
        // When the client hits ENTER on their keyboard
        if (event.which === 13) {
            if (username) {
                sendMessage();
                socket.emit('stop_typing');
                typing = false;
            } else {
                $('#usernameModal').modal('hide');
            }
        }
    });

    // Message input handling
    $inputMessage.on('input', () => {
        updateTyping();
    });


    // Focus input when clicking on the message input's border
    $inputMessage.click(() => {
        $inputMessage.focus();
    });

    // ---Sockets---

    // Whenever the server emits 'login', log the login message
    socket.on('login', (data) => {
        connected = true;
        // Display the welcome message
        var message = "Welcome to MalMal!";
        log(message, {
            prepend: true
        });
        addParticipantsMessage(data);
    });

    // Whenever the server emits 'new message', update the chat body
    socket.on('new_message', (data) => {
        addChatMessage(data);
    });

    // Whenever the server emits 'user joined', log it in the chat body
    socket.on('user_joined', (data) => {
        log(data.username + ' joined');
        addParticipantsMessage(data);
    });

    // Whenever the server emits 'user left', log it in the chat body
    socket.on('user_left', (data) => {
        log(data.username + ' left');
        addParticipantsMessage(data);
        removeChatTyping(data);
    });

    // Whenever the server emits 'typing', show the typing message
    socket.on('typing', (data) => {
        addChatTyping(data);
    });

    // Whenever the server emits 'stop typing', kill the typing message
    socket.on('stop_typing', (data) => {
        removeChatTyping(data);
    });

    // User disconnect message
    socket.on('disconnect', () => {
        log('you have been disconnected');
    });

    // User reconnect handling
    socket.on('reconnect', () => {
        log('you have been reconnected');
        if (username) {
            socket.emit('add user', username);
        }
    });

    // User reconnect error message
    socket.on('reconnect_error', () => {
        log('attempt to reconnect has failed');
    })

    // Unlocking and locking the canvas
    socket.on('canvas_unlock', (data) => {
        if (data === true) {
            allowedToDraw = true;
        } else {
            allowedToDraw = false;
        }
    });

    // Clearing the canvas
    socket.on('canvas_clear', () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
    });

    // Debug capability
    socket.on('debug_message', (data) => {
        log("Debug Message: " + data);
    });

    // Chat instruction
    socket.on('chat_instruction', (data) => {
        log(data);
    });

    // Instruction box (under canvas)
    socket.on('instruction_box', (data) => {
        $('#instructionBox').val(data);
    });

    // Timer data
    socket.on('timer', (data) => {
        if (parseInt(data) < 0) {
            $('#gameTimer').val("");
        } else {
            $('#gameTimer').val("Countdown: " + data);
        }
    });

});