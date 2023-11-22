function readCommandLineAttributes(commandLineArray) {
    let cliConfiguration = {};

    if (commandLineArray && Array.isArray(commandLineArray) && commandLineArray.length > 2){
        let foundValidMode = commandLineArray.find((cliSwitch) => {
            let foundValidMode = true;

            switch(cliSwitch) {
                case '--upload':
                    cliConfiguration["mode"] = "upload";
                    break;
                case '--download':
                    cliConfiguration["mode"] = "download";
                    break;
                case '--nostr':
                    cliConfiguration["mode"] = "nostr";
                    break;
                case '--remove':
                    cliConfiguration["mode"] = "remove"
                    break;
                case '--help':
                    cliConfiguration["mode"] = "help";
                    break;  
                default:
                    foundValidMode = false;
            }

            return foundValidMode;
        });

        if (foundValidMode) {
            switch(cliConfiguration["mode"]) {
                case "upload": {
                    let attributeMap = {};

                    attributeMap["input"] = commandLineArray.indexOf('--input');
                    attributeMap["secretkey"] = commandLineArray.indexOf('--secret-key');
                    attributeMap["storageNodes"] = commandLineArray.indexOf('--storage-nodes');
                    attributeMap["blocksize"] = commandLineArray.indexOf('--block-size-bytes');
                    attributeMap["mime-type"] = commandLineArray.indexOf('--mime-type');
                    attributeMap["dfilename"] = commandLineArray.indexOf('--dfilename');
                    attributeMap["descriptorout"] = commandLineArray.indexOf('--descriptor-output');

                    let elementList = Object.values(attributeMap);

                    if (attributeMap["input"] != -1 && attributeMap["input"] < commandLineArray.length - 1) {
                        if (elementList.indexOf(attributeMap["input"] + 1) == -1){
                            cliConfiguration["input"] = commandLineArray[attributeMap["input"] + 1];
                        }
                    } else {
                        throw new Error("No file specified for upload");
                    }

                    // TODO: Make this optional and read from a .secrets.json file
                    if (attributeMap["secretkey"] != -1 && attributeMap["secretkey"] < commandLineArray.length - 1) {
                        if (elementList.indexOf(attributeMap["secretkey"] + 1) == -1){
                            cliConfiguration["secretkey"] = commandLineArray[attributeMap["secretkey"] + 1];
                        }
                    } else {
                        throw new Error("No secret key specified");
                    }

                    if (attributeMap["blocksize"] != -1) {
                        if (attributeMap["blocksize"] < commandLineArray.length - 1){
                            if (elementList.indexOf(attributeMap["blocksize"] + 1) == -1){
                                let blockSizeBytes = Number.parseInt(commandLineArray[attributeMap["blocksize"] + 1])
                                cliConfiguration["blocksize"] = blockSizeBytes;
                            }
                        } else {
                            throw new Error("No blocksize specified");
                        }
                    } // Default to 512000

                    // TODO: Make this optional and use preferredrelays.json
                    if (attributeMap["storageNodes"] != -1 && attributeMap["storageNodes"] < commandLineArray.length - 1 &&
                    elementList.indexOf(attributeMap["storageNodes"] + 1) == -1) {
                        let storageNodesArray = commandLineArray[attributeMap["storageNodes"] + 1].split(",");
                        cliConfiguration["storageNodes"] = storageNodesArray;
                    } else {
                        throw new Error("No storage nodes specified");
                    }

                    if (attributeMap["mime-type"] != -1) {
                        if (attributeMap["mime-type"] < commandLineArray.length - 1 && 
                        elementList.indexOf(attributeMap["mime-type"] + 1) == -1){
                            cliConfiguration["mime-type"] = commandLineArray[attributeMap["mime-type"] + 1];
                        } else {
                            throw new Error("No mime-type specified");
                        }
                    }

                    if (attributeMap["dfilename"] != -1) {
                        if (attributeMap["dfilename"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["dfilename"] + 1) == -1){
                            cliConfiguration["dfilename"] = commandLineArray[attributeMap["dfilename"] + 1];
                        } else {
                            throw new Error("No filename label specified");
                        }
                    }

                    if (attributeMap["descriptorout"] != -1) {
                        if (attributeMap["descriptorout"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["descriptorout"] + 1) == -1){
                            cliConfiguration["descriptorout"] = commandLineArray[attributeMap["descriptorout"] + 1];
                        } else {
                            throw new Error("No file descriptor name specified");
                        }
                    }

                    // console.log(JSON.stringify(cliConfiguration, undefined, 4));
                    // Find --input $FILENAME
                    // Find --secret-key $KEY
                    // Find --storage-nodes list1,list2,list3
                    // Find --mime-type (optional) $STRING
                    // Find --dFilename (optional) $STRING
                    // Find --descriptor-output $FILENAME


                    break;
                }
                case "download": {
                    // —-descriptor-input
                    // --filename-out
                    let attributeMap = {};
                    
                    attributeMap["descriptorin"] = commandLineArray.indexOf('--descriptor-input');
                    // attributeMap["naddr"] = commandLineArray.indexOf('--naddr');
                    attributeMap["filenameout"] = commandLineArray.indexOf('--filename-output');
                    attributeMap["getinfo"] = commandLineArray.indexOf('--display-info');
                    
                    let elementList = Object.values(attributeMap);

                    if (attributeMap["descriptorin"] != -1 && (attributeMap["descriptorin"] < commandLineArray.length - 1) &&
                        (elementList.indexOf(attributeMap["descriptorin"] + 1) == -1)) {
                        // let blockSizeBytes = Number.parseInt(commandLineArray[attributeMap["blocksize"] + 1])
                        cliConfiguration["descriptorin"] = commandLineArray[attributeMap["descriptorin"] + 1];
                    } else {
                        throw new Error("No descriptor input specified");
                    }

                    if (attributeMap["filenameout"] != -1) {
                        if (attributeMap["filenameout"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["filenameout"] + 1) == -1){
                            cliConfiguration["filenameout"] = commandLineArray[attributeMap["filenameout"] + 1];
                        } else {
                            throw new Error("No file descriptor name specified");
                        }
                    } else if (attributeMap["getinfo"] != -1) {
                        cliConfiguration["displayinfoonly"] = true;
                    }

                    // console.log(JSON.stringify(cliConfiguration, undefined, 4));
                    break;
                }
                case "nostr": {
                    // --to-event
                        // --descriptor-input $FILE
                        // --nostr-key $STRING
                        // --event-file-output $FILE
                        // --publish-to-relays $RELAY1,$RELAY2
                    // --from-event
                        // --descriptor-output $FILE
                        // --naddr $STRING
                        // --event-file-input $FILE

                    let attributeMap = {};
                    
                    attributeMap["toevent"] = commandLineArray.indexOf('--to-event');
                    attributeMap["testrun"] = commandLineArray.indexOf('--test-run');
                    attributeMap["descriptorin"] = commandLineArray.indexOf('--descriptor-input');
                    attributeMap["nostrkey"] = commandLineArray.indexOf('--nostr-key');
                    attributeMap["eventfileout"] = commandLineArray.indexOf('--event-file-output');
                    attributeMap["publishtorelays"] = commandLineArray.indexOf('--publish-to-relays');
                    
                    attributeMap["fromevent"] = commandLineArray.indexOf('--from-event');
                    attributeMap["descriptorout"] = commandLineArray.indexOf('--descriptor-output');
                    attributeMap["naddr"] = commandLineArray.indexOf('--naddr');
                    attributeMap["eventfilein"] = commandLineArray.indexOf('--event-file-input');
                    
                    let elementList = Object.values(attributeMap);

                    if (attributeMap["toevent"] != -1) {
                        cliConfiguration["eventflow"] = "toevent";

                        if (attributeMap["testrun"] != -1){
                            cliConfiguration["testrun"] = true;
                        }

                        if (attributeMap["descriptorin"] != -1 && attributeMap["descriptorin"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["descriptorin"] + 1) == -1){
                            cliConfiguration["descriptorin"] = commandLineArray[attributeMap["descriptorin"] + 1];
                        } else {
                            throw new Error("No descriptor input specified");
                        }

                        if (attributeMap["nostrkey"] != -1 && attributeMap["nostrkey"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["nostrkey"] + 1) == -1){
                            cliConfiguration["nostrkey"] = commandLineArray[attributeMap["nostrkey"] + 1];
                        } else {
                            throw new Error("No nostr key specified. Cannot sign event");
                        }

                        if (attributeMap["eventfileout"] != -1 && attributeMap["eventfileout"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["eventfileout"] + 1) == -1){
                            cliConfiguration["eventfileout"] = commandLineArray[attributeMap["eventfileout"] + 1];
                        } else {
                            throw new Error("No valid event output specified");
                        }
                        
                        if (attributeMap["publishtorelays"] != -1 && attributeMap["publishtorelays"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["publishtorelays"] + 1) == -1){
                            // cliConfiguration["eventfileout"] = commandLineArray[attributeMap["eventfileout"] + 1];
                            let relayList = commandLineArray[attributeMap["publishtorelays"] + 1].split(",");
                            cliConfiguration["relaylist"] = relayList;
                        } else {
                            throw new Error("No valid relays specified");
                        }

                    } else if (attributeMap["fromevent"] != -1){
                        cliConfiguration["eventflow"] = "fromevent";

                        if (attributeMap["descriptorout"] != -1 && attributeMap["descriptorout"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["descriptorout"] + 1) == -1){
                            cliConfiguration["descriptorout"] = commandLineArray[attributeMap["descriptorout"] + 1];
                        } else {
                            throw new Error("No descriptor output specified");
                        }

                        if (attributeMap["naddr"] != -1 && attributeMap["naddr"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["naddr"] + 1) == -1){
                            cliConfiguration["naddr"] = commandLineArray[attributeMap["naddr"] + 1];
                        } else if (attributeMap["eventfilein"] != -1 && attributeMap["eventfilein"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["eventfilein"] + 1) == -1){
                            cliConfiguration["eventfilein"] = commandLineArray[attributeMap["eventfilein"] + 1];
                        } else {
                            throw new Error("No valid event input specified");
                        }
                    } else {
                        throw new Error('Descriptor/Event flow not specified');
                    }
                    console.log(JSON.stringify(cliConfiguration, undefined, 4));
                    break;
                }
                case "remove":{
                    let attributeMap = {};

                    // --descriptor-input
                    // --remove-descriptor $FILE or nostr:naddr1
                    // --secret-key
                    // --nostr-key

                    attributeMap["descriptorin"] = commandLineArray.indexOf('--descriptor-input');
                    attributeMap["secretkey"] = commandLineArray.indexOf('--secret-key');
                    attributeMap["nostrkey"] = commandLineArray.indexOf('--nostr-key');
                    attributeMap["removedescriptor"] = commandLineArray.indexOf('--delete-descriptor');

                    let elementList = Object.values(attributeMap);

                    if (attributeMap["descriptorin"] != -1 && attributeMap["descriptorin"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["descriptorin"] + 1) == -1){
                            cliConfiguration["descriptorin"] = commandLineArray[attributeMap["descriptorin"] + 1];
                        } else {
                            throw new Error("No descriptor input specified");
                        }

                    if (attributeMap["removedescriptor"] != -1){
                        // Delete descriptor json from disk or removal from nostr
                        cliConfiguration["removedescriptor"] = true;
                    }

                    if (attributeMap["secretkey"] != -1 && attributeMap["secretkey"] < commandLineArray.length - 1) {
                        if (elementList.indexOf(attributeMap["secretkey"] + 1) == -1){
                            cliConfiguration["secretkey"] = commandLineArray[attributeMap["secretkey"] + 1];
                        }
                    } else {
                        throw new Error("No secret key specified");
                    }

                    if (attributeMap["nostrkey"] != -1 && attributeMap["nostrkey"] < commandLineArray.length - 1 &&
                        elementList.indexOf(attributeMap["nostrkey"] + 1) == -1){
                            cliConfiguration["nostrkey"] = commandLineArray[attributeMap["nostrkey"] + 1];
                        } // Don't perform nostr key check here. 
                    break;
                }
                default:
                    console.log("Mode is help");
            }
        } else {
            throw new Error("No mode selected");
        }
    } else {
        throw new Error("No arguments")
    }

    return cliConfiguration;
}

module.exports.readCommandLineAttributes = readCommandLineAttributes;