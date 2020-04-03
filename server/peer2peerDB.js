let net = require('net'),
    singleton = require('./Singleton'),
    handler = require('./PeersHandler'),
    commandLineArgs = require('command-line-args');

singleton.init();

let os = require('os');
let ifaces = os.networkInterfaces();
let HOST = '';
let PORT = singleton.getPort(); //get random port number
let imagePort = singleton.getPort();

// get the loaclhost ip address
Object.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (iface) {
        if ('IPv4' == iface.family && iface.internal !== false) {
            HOST = iface.address;
        }
    });
});

// get current folder name
let path = __dirname.split("\\");
let peerLocation = path[path.length - 1];

//parse command line arguments
const optionDefinitions = [
    { name: 'peer', alias: 'p', type: String },
    { name: 'maxPeerNumber', alias: 'n', type: Number },
    { name: 'version', alias: 'v', type: Number }
]

//construct command line args list
const options = commandLineArgs(optionDefinitions);

let maxpeers = options['maxPeerNumber'] || 6;
if (maxpeers < 1) {
    console.log(`Maxpeer must be >= 1`);
    return;
}
let version = options.version || 3314;


// initialize peer table
let peerTable = [];

//create image socket
let imageDB = net.createServer();
imageDB.listen(imagePort, HOST);

console.log('ImageDB server is started at timestamp: ' + singleton.getTimestamp() + ' and is listening on ' + HOST + ':' + imagePort);

imageDB.on('connection', function (sock) {
    handler.handleImageClient(sock, peerLocation, peerTable, maxpeers); //called for each client joining
});


if (options['peer'] != null) {
    // call as node peer [-p <serverIP>:<port> -n <maxpeers> -v <version>]

    // run as a client
    // this needs more work to properly filter command line arguments
    let hostserverIPandPort = options['peer'].split(':');
    let knownHOST = hostserverIPandPort[0];
    let knownPORT = hostserverIPandPort[1];

    // connect to the known peer address
    let clientPeer = new net.Socket();

    //initialize peering declined table
    let peeringDeclinedTable = [];

    //establish peer connection
    clientPeer.connect(knownPORT, knownHOST, function () {

        // add peer to peer table and mark as pending
        peerTable.push({ 'port': clientPeer.remotePort, 'IP': clientPeer.remoteAddress, "pending": true });

        handler.handleCommunications(clientPeer.localPort, clientPeer, maxpeers, peerLocation, peerTable, peeringDeclinedTable);
    });


} else {
    // call as node peer

    // run as a server
    let serverPeer = net.createServer();
    serverPeer.listen(PORT, HOST);
    console.log('This peer address is ' + HOST + ':' + PORT + ' located at ' + peerLocation);

    serverPeer.on('connection', function (sock) {
        // received connection request
        sock.on('data', data => {
            handler.handleClientJoining(sock, data, maxpeers, peerLocation, peerTable);
        })
    });

}


