let net = require('net'),
    cPTPpacket = require('./cPTPmessage'),
    singleton = require('./Singleton');


module.exports = {
    handleClientJoining: function (sock, maxPeers, sender, peerTable) { //when other peer join you
        let peersCount = Object.keys(peerTable).length;
        if (peersCount === maxPeers) {
            declineClient(sock, sender, peerTable);
        } else {
            handleClient(sock, sender, peerTable)
        }
    },

    handleCommunications: function (client, maxPeers, location, peerTable, peeringDeclinedTable) {

        // add peer to peer table and mark as pending
        peerTable.push({ 'port': client.remotePort, 'IP': client.remoteAddress, "pending": true });

        client.on('data', (message) => {
            let returned_peer = {}

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


                if (peerPort !== client.localPort && peerIP !== client.localAddress)
                    returned_peer.push({ 'port': peerPort, 'IP': peerIP })

            }


            if (msgType == 1) { //server welcomes you

                //keep peer in peer table and untick pending state
                peerTable.forEach(element => {
                    if (element["port"] === client.remotePort && element["IP"] === client.remoteAddress)
                        element["pending"] = false;
                });

                //logging information
                console.log("Connected to peer " + sender + ":" + client.remotePort + " at timestamp: " + singleton.getTimestamp());

                //logging information
                console.log("Received ack from " + sender + ":" + client.remotePort);
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
                let dec_index = peeringDeclinedTable.length % maxPeers;
                peeringDeclinedTable[dec_index] = { 'port': client.remotePort, 'IP': client.remoteAddress };


                console.log("Received ack from " + sender + ":" + client.remotePort);
                returned_peer.forEach(element => {
                    console.log("  which is peered with: " + element['IP'] + ":" + element['port']);
                });
                // if (numberOfPeers > 0)
                //     console.log("  which is peered with: " + peerIP + ":" + peerPort); //needs change!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                console.log("Join redirected, try to connect to the peer above.");
            }
        });

        //handle server shut down socket
        client.on('end', () => {

            //check if item in returned list already exists in peer table, if not, send out request and add into peer table and mark as pending
            //stop when peer table is full, or returned list is exhausted.

            returned_peer.forEach(element => { //loop each item in returned peer table

                //check if peer table is full
                if (!peerTable.length == maxPeers) {

                    //if not full, check if peer exists in peer table or peeringDelined table
                    if (!peerTable.contains(element['port'], element['IP']) && !peeringDeclinedTable.contains(element['port'], element['IP'])) {

                        //peer does not exist in peer table or peering declined table, send request
                        client.connect(element['port'], element['IP'], function () {
                            handler.handleCommunications(client, maxPeers, location, peerTable, peeringDeclinedTable);
                        });

                    }

                } else { //if peer table is full just quit
                    break;
                }
            });

            //check condition (no pending peer) and start server
            if (!hasPendingPeer(peerTable)) {
                // Now run as a server, create server and listen at localport and local address
                let serverPeer = net.createServer();
                serverPeer.listen(client.localPort, client.localAddress);

                //logging information
                console.log('This peer address is ' + client.localAddress + ':' + client.localPort + ' located at ' + location);

                //handle incomming connection
                serverPeer.on('connection', function (sock) {
                    handleClientJoining(sock, maxPeers, location, peerTable);
                });
            }

        });

    }
};

function handleClient(sock, sender, peerTable) {
    // accept client request
    addClient(sock, peerTable);

    // send acknowledgment to the client
    cPTPpacket.init(1, sender, peerTable);
    sock.write(cPTPpacket.getPacket());
    sock.end();
}

function declineClient(sock, sender, peerTable) {
    let peerAddress = sock.remoteAddress + ':' + sock.remotePort;
    console.log('\nPeer table full: ' + peerAddress + ' redirected');

    // send acknowledgment to the client
    cPTPpacket.init(2, sender, peerTable);
    sock.write(cPTPpacket.getPacket());
    sock.end();
}

function addClient(sock, peerTable) {

    peerTable.push({ 'port': sock.remotePort, 'IP': sock.remoteAddress, 'pending': false });

    let peerAddress = sock.remoteAddress + ':' + sock.remotePort;
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
    this.forEach(element => {
        if (element['port'] === port && element['IP'] === IP)
            return true;
    });
    return false;
}

function hasPendingPeer(array) {
    array.forEach(element => {
        if (element['pending'] == true)
            return true;
    });
    return false;
}