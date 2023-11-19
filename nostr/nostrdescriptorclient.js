const NostrDescriptor = import('../derby-tools/datadescriptor/nostr.js');
const NostrTools = require('nostr-tools');
const defaultRelayList = ['wss://relay.damus.io', 'wss://nostr.mom'];
import('websocket-polyfill');

async function getNostrDescriptionByNAddressTest(nAddr) {
    return new Promise((resolve, reject) => {
        getNostrDescriptorByNAddress(nAddr, (err, newEvent) => {
            resolve(newEvent);
        });
    });
}

function getNostrDescriptorByNAddressSync(nAddr) {
    try {
        let waitingForDescriptor = true;
        let descriptorEvent;

        getNostrDescriptorByNAddress(nAddr, (err, newEvent) => {
            if (!err) {
                descriptorEvent = newEvent;
                waitingForDescriptor = false;
            } else {
                throw err;
            }
        });

        let timeOutSetting = setTimeout(() => {
            waitingForDescriptor = false;
        }, 5000);
        while(waitingForDescriptor){

        }

        clearTimeout(timeOutSetting);

        return descriptorEvent;
    } catch (e) {
        throw e;
    }
}

function getNostrDescriptorByNAddress(nAddr, callback) {
    try {
        if (nAddr.startsWith('naddr1')){
            let nAddressDecoded = NostrTools.nip19.decode(nAddr);

            let relayList = nAddressDecoded.data.relays ? nAddressDecoded.data.relays : defaultRelayList;
            let descriptorRequest = {
                authors:[nAddressDecoded.data.pubkey],
                kinds:[nAddressDecoded.data.kind],
                "#d":[nAddressDecoded.data.identifier]
            };
            let counter = 0;
            let eventResponseList = [];
            for (let i = 0; i < relayList.length; i++){
                let thisRelayURL = relayList[i];

                temporaryWSConnection(thisRelayURL, (err, relayClient) => {
                    if (!err){
                        relayClient.on("message", (event) => {
                            let responseJSON = JSON.parse(event);
                            if (responseJSON && Array.isArray(responseJSON) && responseJSON.length > 0){
                                let responsePrefix = responseJSON[0];

                                if (responsePrefix == "EOSE"){
                                    counter++;
        
                                    if (counter == relayList.length){

                                        eventResponseList = eventResponseList.sort((eventA, eventB) => {
                                            return eventB.created_at - eventA.created_at;
                                        });

                                        let newestEvent = eventResponseList.length > 0 ? eventResponseList[0] : undefined;

                                        callback(undefined, newestEvent);
                                    }
                                } else if (responsePrefix == "EVENT"){
                                    let thisEvent = responseJSON[2];

                                    if (NostrTools.verifySignature(thisEvent)){
                                        eventResponseList.push(thisEvent);
                                    }
                                }
                            }
                            
                        });

                        relayClient.send(JSON.stringify(["REQ",Math.floor(Date.now() / 1000).toString(), descriptorRequest]));
                    } else {
                        counter++;
                        console.log("Error connecting to relay" + thisRelayURL);
                        
                        if (counter == relayList.length) {
                            eventResponseList = eventResponseList.sort((eventA, eventB) => {
                                return eventB.created_at - eventA.created_at;
                            });

                            let newestEvent = eventResponseList.length > 0 ? eventResponseList[0] : undefined;

                            callback(undefined, newestEvent);
                        }
                    }
                });
            }
        } else {
            throw new Error("Invalid nAddress");
        }
    } catch (e) {
        callback(e);
    }
}

function publishDescriptorEvents(relays, newEvent, callback){
    let relayList = relays ? relays : defaultRelayList;
    try {
        let counter = 0;
        for (let i = 0; i < relayList.length; i++){
            let thisRelayURL = relayList[i];

            temporaryWSConnection(thisRelayURL, (err, relayClient) => {
                // counter++;
                if (!err){
                    relayClient.on("message", (event) => {
                        counter++;
                        // console.log(event.toString());
                        
                        if (counter == relayList.length) {
                            callback(undefined, true);
                        }
                    });

                    relayClient.send(JSON.stringify(["EVENT", newEvent]));
                } else {
                    counter++;
                    console.log("Error connecting to relay" + thisRelayURL);
                    if (counter == relayList.length) {
                        callback(undefined, true);
                    }
                }

                // if (counter == relayList.length) {
                //     callback(undefined, true);
                // }
            });
        }
    } catch (e) {
        console.log(e);
        callback(e);
    }
}

function temporaryWSConnection(relayURL, callback) {
    const ws = require('ws');

    try {
        if (relayURL) {
            let thisNostrRelayClient = new ws(relayURL);

            thisNostrRelayClient.on("open", (event) => {
                callback(undefined, thisNostrRelayClient);
            });

            thisNostrRelayClient.on("error", (event) => {
                throw new Error("Error connecting to relay");
            });

        } else {
            throw new Error("Relay URL invalid");
        }

    } catch (e) {
        callback(e);
    }
    
}

module.exports.getNostrDescriptorByNAddress = getNostrDescriptorByNAddress;
module.exports.publishDescriptorEvents = publishDescriptorEvents;
module.exports.getNostrDescriptorByNAddressSync = getNostrDescriptorByNAddressSync;
module.exports.getNostrDescriptionByNAddressTest = getNostrDescriptionByNAddressTest;