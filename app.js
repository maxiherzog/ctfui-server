const { deepStrictEqual } = require('assert');
const { Socket } = require('socket.io');

const Express = require('express')();
const Http = require('http').Server(Express);
const Socketio = require('socket.io')(Http, {
    cors: {
        origin: 'http://localhost:8080',
        methods: ['GET', 'POST'],
        allowedHeaders: ["ctf-header-jo"],
        credentials: true
    }
});

// string: buchstabe, list of socket_ids that represent players, status: -100 red, 0 neutral, 100 blue

var ticketDecay = 1;
const buchstaben = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];


var settings = {
    flagAmount: 3,
    startingTickets: 100,
    respawnTime: 10,
    captureTime: 10,
    ticketDecrement: 1,
    ticketDecay: 1
};



var tickets = [100, 100]; // TODO
var disconnected_ids = [];
var previousFlags = [];
var flags = [];
var gamestate = "lobby";

function initializeFlags() {
    // keep state of flags in previousFlags (deep copy)
    previousFlags = JSON.parse(JSON.stringify(flags));
    var flags_new = [];
    for (let i = 0; i < settings.flagAmount; i++) {
        flags_new[i] = {
            letter: buchstaben[i],
            players: [],
            status: 0,
            ready: false,
        }
    }
    flags = flags_new;
}

initializeFlags();
// console.log(flags);
// create Game loop intveral updating each 5 seconds

function start() {
    console.log("start");
    gamestate = "running";
    Socketio.emit("gamestate", gamestate);
    setInterval(gameLoopFun, 5000);
}

function gameLoopFun() {
     // check if a flag is captured
     for (let i = 0; i < settings.flagAmount; i++) {
        if (flags[i].status == -100) {
            tickets[0] -= settings.ticketDecay;
        } else if (flags[i].status == 100) {
            tickets[1] -= settings.ticketDecay;
        }
    }
    // check if a team has won
    if (tickets[0] <= 0 || tickets[1] <= 0){
        gamestate = "game over";
        Socketio.emit("gamestate", gamestate);
        clearInterval(gameLoop);
    } 

    Socketio.emit("tickets", tickets);
}

var gameLoop = setInterval(gameLoopFun, 50);

// every time a player connects
Socketio.on('connection', socket => {
    console.log("player connected: " + socket.id);
    // assign flag to player, if their players array is empty
    var was_flag_assigned = false;
    for (let i = 0; i < settings.flagAmount; i++) {
        if (flags[i].players.length == 0) {
            flags[i].players.push(socket.id);
            was_flag_assigned = true;
            break;
        }
    } // otherwise assign random flag to player
    if (!was_flag_assigned) {
        var random_flag = Math.floor(Math.random() * settings.flagAmount);
        flags[random_flag].players.push(socket.id);
    }
    // console.log(flags)
    // send flags to client
    socket.emit("gamestate", gamestate);
    socket.emit("flags", flags);
    socket.emit("tickets", tickets);
    socket.emit("settings", settings);

    socket.on("namechange", (old_id) => {
        console.log("namechange", socket.id, "->", old_id);
        // console.log(flags);
        var flag_before = -1;
        for (let i=0; i < flags.length; i++){
            for (let j=0; j < flags[i].players.length; j++){
                if (flags[i].players[j] === socket.id){
                    // remove
                    flag_before = i;
                    flags[i].players.splice(j, 1);
                }
            }
        }

        var found = false;
        for (let i=0; i < disconnected_ids.length; i++){
            console.log("\t", disconnected_ids[i].id, old_id, disconnected_ids[i].id == old_id, disconnected_ids[i].flag_id)
            if (disconnected_ids[i].id === old_id) {
                console.log("\t found flag:", disconnected_ids[i].flag_id);
                flags[disconnected_ids[i].flag_id].players.push(socket.id);
                found = true;
                break;
                // disconnected_ids.splice(i, 1);
            }
        }
        if (!found) {
            // assign random flag to player
            flags[flag_before].players.push(socket.id);
        }

        console.log(flags);
        socket.emit("flags", flags);
        socket.broadcast.emit("flags", flags);
        // console.log(flags)
    });

    // stuff for lobby
    socket.on("ready", (ready) => {
        console.log("ready: " + ready, socket.id)
        for (let i = 0; i < settings.flagAmount; i++) {
            if (flags[i].players.includes(socket.id)) {
                flags[i].ready = ready;
                break;
            }
        }
        socket.emit("flags", flags);
        socket.broadcast.emit("flags", flags);

        // check if >= 2 players are ready
        var readies = flags.filter(flag => flag.ready).length;
        if (gamestate==="lobby" && readies >= 2) {
            // start game
            console.log("start game");
            gamestate = "running";
            // restart game loop
            clearInterval(gameLoop);
            gameLoop = setInterval(gameLoopFun, 5000);
            socket.emit("gamestate", gamestate);
            socket.broadcast.emit("gamestate", gamestate);
        }

    });


    socket.on("cycleFlag", () => {
        console.log("cycleFlag", socket.id)
        // move socket id from one flag to the following one
        for (let i = 0; i < settings.flagAmount; i++) {
            if (flags[i].players.includes(socket.id)) {
                console.log(i)
                flags[i].players.splice(flags[i].players.indexOf(socket.id), 1);
                if (i == settings.flagAmount - 1) {
                    flags[0].players.push(socket.id);
                } else {
                    flags[i + 1].players.push(socket.id);
                }
                break;
            }
        }
        console.log(flags)

        socket.emit("flags", flags);
        
    });

    socket.on("restart", settings_new => {
        console.log("restart");
        console.log(settings)
        
        // keep list of players
        // if amount of flags did not change, keep players on flags
        
        var players = [];
        for (let i = 0; i < settings.flagAmount; i++) {
            players = players.concat(flags[i].players);
        }

        //make deep copy of flags
        var flags_from_before = JSON.parse(JSON.stringify(flags));

        // init flags
        settings = settings_new;
        initializeFlags(settings.flagAmount);
        console.log(flags_from_before);
        // TODO: Don't reassign players if amount of flags did not change


        // reassign players to flags
        for (let i = 0; i < players.length; i++) {
            var was_flag_assigned = false;
            for (let j = 0; j < settings.flagAmount; j++) {
                if (flags[j].players.length == 0) {
                    flags[j].players.push(players[i]);
                    was_flag_assigned = true;
                    break;
                }
            } // otherwise assign random flag to player
            if (!was_flag_assigned) {
                var random_flag = Math.floor(Math.random() * settings.flagAmount);
                flags[random_flag].players.push(players[i]);
            }
        }

        console.log(flags)
        tickets = [settings.startingTickets, settings.startingTickets];
        // ticketDecay = settings.ticketDecay;

        

        socket.emit("settings", settings);
        socket.broadcast.emit("settings", settings);
        gamestate = "lobby";
        socket.emit("gamestate", gamestate);
        socket.broadcast.emit("gamestate", gamestate);
        socket.emit("flags", flags);
        socket.broadcast.emit("flags", flags);
    });

    socket.on("backToLobby", () => {
        gamestate = "lobby";
        socket.emit("gamestate", gamestate);
        socket.broadcast.emit("gamestate", gamestate);

        // make all flags unready
        for (let i = 0; i < settings.flagAmount; i++) {
            flags[i].ready = false;
            flags[i].status = 0;
        }
        tickets = [settings.startingTickets, settings.startingTickets];
        socket.emit("tickets", tickets);
        socket.broadcast.emit("tickets", tickets);
        socket.emit("flags", flags);
        socket.broadcast.emit("flags", flags);
    });

    socket.on("capture", status => {
        // change status of flag
        for (let i = 0; i < settings.flagAmount; i++) {
            if (flags[i].players.includes(socket.id)) {
                flags[i].status = status;
                break;
            }
        }
        socket.emit("flags", flags);
        socket.broadcast.emit("flags", flags);
    });

    socket.on("subtractTicket", () => { 
        for (let i = 0; i < settings.flagAmount; i++) {
            if (flags[i].players.includes(socket.id)) {
                if (flags[i].status == -100) {
                    tickets[1] -= settings.ticketDecrement;
                } else if (flags[i].status == 100) {
                    tickets[0] -= settings.ticketDecrement;
                }
                break;
            }
        }
        socket.emit("tickets", tickets);
        socket.broadcast.emit("tickets", tickets);
    });

    socket.on('disconnect', (reason) => {
        console.log('player disconnected: ' + socket.id);
        console.log('\treason: ' + reason);
        // remove player from flags
        for (let i = 0; i < settings.flagAmount; i++) {
            if (flags[i].players.includes(socket.id)) {
                console.log("\tflag: " + i);
                disconnected_ids.push({flag_id: i, id: socket.id})
                console.log(flags[i].players)
                flags[i].players.splice(flags[i].players.indexOf(socket.id), 1);
                console.log(flags[i].players)
            }
        }
        console.log("\tremoved player from flags.");
    });
});

Http.listen(3000, () => {
    console.log('Listening at :3000...');
});
