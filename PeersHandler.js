let net = require('net'),
    cPTPpacket = require('./cPTPmessage'),
    singleton = require('./Singleton');

function handleClientJoining(sock, data, maxPeers, sender, peerTable) { //when other peer join you

    let port = bytes2number(data.slice(0, 2));

    // console.log(`handling peer join from ${port}`)

    if (peerTable.length == maxPeers) {
        declineClient(sock, port, sender, peerTable);
    } else {
        handleClient(sock, port, sender, peerTable)
    }
    console.log("\ncurrent peer table: ");
    console.log(peerTable);
};


function handleCommunications(peerLocalPort, client, maxPeers, location, peerTable, peeringDeclinedTable) {

    let returned_peer = [];
    let localAddress;

    let buffer = new Buffer.alloc(2);

    let p1 = peerLocalPort << 16;
    let p2 = peerLocalPort << 24;
    buffer[0] = (p1 >>> 24);
    buffer[1] = (p2 >>> 24);

    client.write(buffer);

    console.log(`\nconnection with ${client.remoteAddress}:${client.remotePort} is being handled. `);


    client.on('data', (message) => {

        // console.log(`got message from ${client.remoteAddress}:${client.remotePort}\nReceived: `);
        // console.log(message);

        localAddress = client.localAddress;

        let version = bytes2number(message.slice(0, 3));
        let msgType = bytes2number(message.slice(3, 4));
        let sender = bytes2string(message.slice(4, 8));
        let numberOfPeers = bytes2number(message.slice(8, 12));

        //populate returned_peer array with returned peers
        for (let i = 0; i < numberOfPeers; i++) {
            let reserved = bytes2number(message.slice(12 + 8 * i, 14 + 8 * i));
            let peerPort = bytes2number(message.slice(14 + 8 * i, 16 + 8 * i));
            let peerIP = bytes2number(message.slice(16 + 8 * i, 17 + 8 * i)) + '.'
                + bytes2number(message.slice(17 + 8 * i, 18 + 8 * i)) + '.'
                + bytes2number(message.slice(18 + 8 * i, 19 + 8 * i)) + '.'
                + bytes2number(message.slice(19 + 8 * i, 20 + 8 * i));

            if (peerPort !== peerLocalPort || peerIP !== client.localAddress)
                returned_peer.push({ 'port': peerPort, 'IP': peerIP });

        }

        console.log("\nreturned peers: ");
        console.log(returned_peer);


        if (msgType == 1) { //server welcomes you

            //keep peer in peer table and untick pending state
            peerTable.forEach(element => {
                if (element["port"] === client.remotePort && element["IP"] === client.remoteAddress)
                    element["pending"] = false;
            });

            //logging information
            console.log("\nConnected to peer " + sender + ":" + client.remotePort + " at timestamp: " + singleton.getTimestamp());

            //logging information
            console.log("\nReceived ack from " + sender + ":" + client.remotePort);
            returned_peer.forEach(element => {
                console.log("  which is peered with: " + element['IP'] + ":" + element['port']);
            });

            // if ((numberOfPeers > 0) && (client.localPort != peerPort))
            //     console.log("  which is peered with: " + peerIP + ":" + peerPort);


        } else { //server rejects you

            //remove peer from peer table
            for (let i = 0; i < peerTable.length; i++) {
                if (peerTable[i]["port"] === client.remotePort && peerTable[i]["IP"] === client.remoteAddress) {
                    peerTable.splice(i, 1);
                    break;
                }
            }

            //add peer into peeringdeclined table
            if (peeringDeclinedTable.length == maxPeers)
                peeringDeclinedTable.splice(0, 1);
            peeringDeclinedTable.push({ 'port': client.remotePort, 'IP': client.remoteAddress });



            console.log("\nReceived ack from " + sender + ":" + client.remotePort);
            returned_peer.forEach(element => {
                console.log("  which is peered with: " + element['IP'] + ":" + element['port']);
            });

            console.log(`\nJoin declined.`);


        }

        console.log(`\ncurrent peer table: `);
        console.log(peerTable);
        console.log(`\ncurrent peering declined table: `);
        console.log(peeringDeclinedTable);
    });

    //handle server shut down socket
    client.on('end', () => {


        // console.log("connection ended with: " + client.remotePort);
        // console.log("current peer table after ending connection: ");
        // console.log(peerTable);
        let hasMoreConnection = false;

        //check if item in returned list already exists in peer table, if not, send out request and add into peer table and mark as pending
        //stop when peer table is full, or returned list is exhausted.

        returned_peer.forEach(element => { //loop each item in returned peer table

            //check if peer table is full
            if (peerTable.length !== maxPeers) {

                //if not full, check if peer exists in peer table or peeringDelined table
                let peerInPeerTable = false;
                let peerInPeeringDeclinedTable = false;

                peerTable.forEach(peer => {
                    if (peer['port'] === element['port'] && peer['IP'] === element['IP'])
                        peerInPeerTable = true;
                });

                peeringDeclinedTable.forEach(decPeer => {
                    if (decPeer['port'] === element['port'] && decPeer['IP'] === element['IP'])
                        peerInPeeringDeclinedTable = true;
                });


                if (!peerInPeerTable && !peerInPeeringDeclinedTable) {
                    hasMoreConnection = true;

                    // wait(1250);

                    //peer does not exist in peer table or peering declined table, send request
                    requestConnection(element['port'], element['IP'], maxPeers, location, peerTable, peeringDeclinedTable, peerLocalPort);


                }

            }


        });

        //check condition (no pending peer) and start server
        let hasPendingPeer = false;

        peerTable.forEach(peer => {
            if (peer['pending'] == true)
                hasPendingPeer = true;
        });

        if (!hasPendingPeer && !hasMoreConnection) {
            // Now run as a server, create server and listen at localport and local address
            let serverPeer = net.createServer();
            serverPeer.listen(peerLocalPort, localAddress);

            //logging information
            console.log('\nThis peer address is ' + localAddress + ':' + peerLocalPort + ' located at ' + location);

            //handle incomming connection
            serverPeer.on('connection', function (sock) {
                // handleClientJoining(sock, maxPeers, location, peerTable);
                sock.on('data', data => {
                    handleClientJoining(sock, data, maxPeers, location, peerTable);
                })
            });

            serverPeer.on('error', err => {
                if (err.code !== 'EADDRINUSE') {
                    throw err;
                  }
            })

        }




    });

};

module.exports = {
    handleClientJoining,
    handleCommunications
};

function requestConnection(port, address, maxPeers, location, peerTable, peeringDeclinedTable, peerLocalPort) {

    let sock = new net.Socket();
    console.log('\n\nestablishing connection with ' + address + ":" + port);
    sock.connect(
        {
            port: port,
            host: address,
            // localPort: localPort,
            // localAddress: localAddress,
        }, function () {
            console.log(`connected with ${address}:${port}, local address: ${sock.localAddress}:${sock.localPort}`);
            peerTable.push({ 'port': port, 'IP': address, "pending": true });
            handleCommunications(peerLocalPort, sock, maxPeers, location, peerTable, peeringDeclinedTable);
        });


}

function handleClient(sock, port, sender, peerTable) {
    // accept client request
    addClient(sock, port, peerTable);

    // send acknowledgment to the client
    cPTPpacket.init(1, sender, peerTable);



    sock.end(cPTPpacket.getPacket());
    // console.log(`ended connection with ${sock.remoteAddress}:${port}`)
}

function declineClient(sock, port, sender, peerTable) {
    let peerAddress = sock.remoteAddress + ':' + port;
    console.log('\nPeer table full: ' + peerAddress + ' redirected');

    // send acknowledgment to the client
    cPTPpacket.init(2, sender, peerTable);



    sock.end(cPTPpacket.getPacket());
    // console.log(`ended connection with ${sock.remoteAddress}:${port}`)
}

function addClient(sock, port, peerTable) {

    peerTable.push({ 'port': port, 'IP': sock.remoteAddress, 'pending': false });

    let peerAddress = sock.remoteAddress + ':' + port;
    console.log('\nConnected from peer ' + peerAddress);
}

function bytes2string(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) {
        if (array[i] > 0)
            result += (String.fromCharCode(array[i]));
    }
    return result;
}

function bytes2number(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) {
        result ^= array[array.length - i - 1] << 8 * i;
    }
    return result;
}

Array.prototype.contains = (port, IP) => {
    let arr = Object(this);
    arr.forEach(element => {
        if (element['port'] === port && element['IP'] === IP)
            return true;
    });
    return false;
}

// function wait(ms) {
//     var start = Date.now(),
//         now = start;
//     while (now - start < ms) {
//         now = Date.now();
//     }
// }