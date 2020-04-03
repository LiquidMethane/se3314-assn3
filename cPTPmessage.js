//size of the response packet header:

//Fields that compose the header
let version,
    messageType;

module.exports = {
    message: '', //Bitstream of the cPTP header

    init: function (msgType, sender, peerTable) {
        let noOfPeers = peerTable.length;
        let HEADER_SIZE = 12 + 8 * noOfPeers;

        //fill by default header fields:
        version = 3314;

        //fill changing header fields:
        messageType = msgType;

        //build the header bistream:
        //--------------------------
        this.message = new Buffer.alloc(HEADER_SIZE);

        //fill the header array of bytes
        // first 4 bytes
        let v1 = version << 8;
        this.message[0] = (v1 >>> (24));
        let v2 = version << 16;
        this.message[1] = (v2 >>> (24));
        let v3 = version << 24;
        this.message[2] = (v3 >>> (24));
        this.message[3] = (messageType);

        //second 4 bytes
        let senderBytes = stringToBytes(sender); // should be within 4 bytes
        for (var i = 4; i < 8; i++) {
            this.message[i] = senderBytes[i - 4] || '';
        }
        // third 4 bytes
        let n1 = noOfPeers;
        this.message[8] = (n1 >>> 24);
        let n2 = noOfPeers << 8;
        this.message[9] = (n2 >>> 24);
        let n3 = noOfPeers << 16;
        this.message[10] = (n3 >>> 24);
        let n4 = noOfPeers << 24;
        this.message[11] = (n4 >>> 24);

        //add all peers in peer table to message
        for (let i = 0; i < noOfPeers; i++) {
            
            //reserved
            this.message[12 + 8 * i] = '';
            this.message[13 + 8 * i] = '';

            //port
            let p1 = peerTable[i]['port'] << 16;
            let p2 = peerTable[i]['port'] << 24;
            this.message[14 + 8 * i] = (p1 >>> 24);
            this.message[15 + 8 * i] = (p2 >>> 24);

            //address
            let ip = peerTable[i]['IP'].split('.');
            this.message[16 + 8 * i] = ip[0];
            this.message[17 + 8 * i] = ip[1];
            this.message[18 + 8 * i] = ip[2];
            this.message[19 + 8 * i] = ip[3];
        }
    },

    //--------------------------
    //getpacket: returns the entire packet
    //--------------------------
    getPacket: function () {
        return this.message;
    }


};

function stringToBytes(str) {
    var ch, st, re = [];
    for (var i = 0; i < str.length; i++) {
        ch = str.charCodeAt(i);  // get char
        st = [];                 // set up "stack"
        do {
            st.push(ch & 0xFF);  // push byte to stack
            ch = ch >>> 8;          // shift value down by 1 byte
        }
        while (ch);
        // add stack contents to result
        // done because chars have "wrong" endianness
        re = re.concat(st.reverse());
    }
    // return an array of bytes
    return re;
}


