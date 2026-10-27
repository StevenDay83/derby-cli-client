// Derby CLI
const CommandLineTools = require('./commandline.js');
// import * as CommandLineTools from './commandline.js'
const DerbyTools = require('./derby-tools/module');
const { UploadTransferManager } = require('./derby-tools/storagerelay/transfermanager');
const NostrDescriptorClient = require('./nostr/nostrdescriptorclient.js');
// import * as NostrDescriptorClient from './nostr/nostrdescriptorclient.js';
const Logger = require('./logger.js');


process.env.LogLevel = Logger.DEBUG;

// console.log(process.argv);
// process.exit(0);
    let CommandLineMode;
try {
    CommandLineMode = CommandLineTools.readCommandLineAttributes(process.argv);

    if (!CommandLineMode){


        // if (CommandLineMode.mode == "upload"){
            throw new Error("Invalid mode");
        // }
    }
} catch (e) {
    console.error(e);

    const fs = require('fs');
    // console.info("Print --help");
    let CommandLineHelp = fs.readFileSync("commandlineswitches.txt");

    console.log(CommandLineHelp.toString());
    process.exit(1);
}

try {
    if (CommandLineMode.ignoressl){
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
    }
    
    if (CommandLineMode.mode == "upload"){
        Logger.WriteLog("Upload Mode Selected");
        const fs = require('fs');

        let inputFile = CommandLineMode.input;
        let secretKey = DerbyTools.Bech32Code.isEncodedPrivateKey(CommandLineMode.secretkey) ? 
        DerbyTools.Bech32Code.decodeNetworkPrivateKey(CommandLineMode.secretkey) : CommandLineMode.secretkey;
        let blocksize = CommandLineMode.blocksize;
        let descriptorOutput = CommandLineMode.descriptorout
        let fileLabel = CommandLineMode.dfilename;
        let storageNodeArray = CommandLineMode.storageNodes;
        let mimeType = CommandLineMode["mime-type"];

        if (blocksize >= 1000) {
            if (storageNodeArray && Array.isArray(storageNodeArray) && storageNodeArray.length > 0){
                if (fs.existsSync(inputFile)) {
                    
                    Logger.WriteLog("Connecting to storage nodes");
                    createNodePool(storageNodeArray, (messageManagerPool) => {
                        if (messageManagerPool && messageManagerPool.length > 0){
                            Logger.WriteLog("Successfully connected to " + messageManagerPool.length + " storage nodes");

                            Logger.WriteLog("Reading file " + inputFile);
                            let fileData = fs.readFileSync(inputFile);

                            if (fileData) {
                                let dataChunksArray = DerbyTools.BlobTools.chunkData(fileData, blocksize);

                                if (dataChunksArray && dataChunksArray.length > 0){
                                    Logger.WriteLog("Broke data into " + dataChunksArray.length + " chunks");

                                    let newDataDescriptor = new DerbyTools.DataDescriptor();
                                    newDataDescriptor.setDataMimeType(mimeType?mimeType:"");
                                    newDataDescriptor.setFilename(fileLabel?fileLabel:"");

                                    let UploadTransfer = new DerbyTools.TransferManager.UploadTransferManager(messageManagerPool,newDataDescriptor,secretKey);
                                // callback(undefined, thisMessageManager.relayClient.relayURL, pointerId, pHash, lastRelayForBlock, lastRelay); 
                                UploadTransfer.importDataChunksList(dataChunksArray);
                                    let blockCounter = 0;
                                    let relayBlockCounter = {};
                                    UploadTransfer.uploadFileData((err, uploadedRelayURL, uploadedPointerId, 
                                        uploadedPointerHash, isLastBlockRelay, isLastRelay) => {
                                            let percentage = 0;
                                            if (!err){
                                                // if (!isLastBlockRelay){
                                                    // relayBlockCounter[uploadedRelayURL] = relayBlockCounter[uploadedRelayURL] == undefined ? 
                                                    // 1 : relayBlockCounter[uploadedRelayURL]++;

                                                    if (relayBlockCounter[uploadedRelayURL] == undefined){
                                                        relayBlockCounter[uploadedRelayURL] = 1;
                                                    } else {
                                                        relayBlockCounter[uploadedRelayURL] += 1;
                                                    }

                                                    blockCounter++;
                                                    percentage = Math.ceil((relayBlockCounter[uploadedRelayURL] / dataChunksArray.length) * 100);

                                                    Logger.WriteLog('Node - ' + uploadedRelayURL + ': ' + "Published pointer " + uploadedPointerId, Logger.DEBUG);
                                                    Logger.WriteLog('Node - ' + uploadedRelayURL + ': ' + "Upload Progress " + percentage + "% (" + relayBlockCounter[uploadedRelayURL] + 
                                                    " blocks of " + dataChunksArray.length + ")");
                                                    // Logger.WriteLog('Node - ' + uploadedRelayURL + ': ' + "Upload Progress " + percentage + "% (" + blockCounter + 
                                                    // " blocks of " + dataChunksArray.length + ")");
                                                    if (isLastBlockRelay && isLastRelay) {
                                                        Logger.WriteLog("Upload completed");

                                                        let dataDescriptorJSON = newDataDescriptor.generateDataDescriptorJSON();

                                                        if (descriptorOutput != 'stdout'){
                                                            Logger.WriteLog("Saving data descriptor to " + descriptorOutput);
                                                            fs.writeFileSync(descriptorOutput, JSON.stringify(dataDescriptorJSON, undefined, 4));
                                                        } else {
                                                            console.log(JSON.stringify(dataDescriptorJSON, undefined, 4));
                                                        }

                                                        // process.exit(0);
                                                        setTimeout(() => {
                                                            process.exit(0);
                                                        }, 1000);
                                                    }
                                                // }
                                            } else {
                                                if (isLastBlockRelay && isLastRelay){
                                                    setTimeout(() => {
                                                        process.exit(1);
                                                    }, 100);
                                                }
                                                Logger.WriteLog('Node - ' + uploadedRelayURL + ': ' + err.message);
                                                // Logger.WriteLog("Aborting upload");
                                                // process.exit(1);
                                                // throw (err);
                                            }
                                        });

                                } else {
                                    throw new Error("Error breaking up file data");
                                }

                            } else {
                                throw new Error("File load error");
                            }
                        }
                    });

                } else {
                    throw new Error("File not found: " + inputFile);
                }
            } else {
                throw new Error("Invalid storage node list");
            }

        } else {
            throw new Error("Invalid block size: " + blocksize + ". Minimum block size is 1000 bytes.");
        }

    } else if (CommandLineMode.mode == "download"){
        Logger.WriteLog("Download Mode Selected");
        const fs = require('fs');


        let dataDescriptorFilename = CommandLineMode.descriptorin;
        let nAddress;
        let dataDescriptorFileData;
        let newDataDescriptor;

        if (dataDescriptorFilename.toLowerCase().startsWith('nostr:')) {
            // Nostr
            let nAddressURI = dataDescriptorFilename.toLowerCase().split(':');

            if (nAddressURI.length == 2) {
                nAddress = nAddressURI[1];

                Logger.WriteLog("Reading data descriptor from Nostr address " + nAddress);
                // Logger.WriteLog("TBD Read Nostr NAddr1");

                NostrDescriptorClient.getNostrDescriptorByNAddress(nAddress, (err, newEvent) => {
                    newDataDescriptor = DerbyTools.NostrDescriptor.importDescriptorFromEvent(newEvent);
                    let filenameLabel = CommandLineMode.filenameout;
                    
                    if (CommandLineMode.displayinfoonly){
                        // console.log("Display Info Only");
                        displayDescriptorInfo(newDataDescriptor);
                        process.exit(0);
                    } else {
                        downloadFromDataDescriptor(newDataDescriptor, filenameLabel);
                    }

                });

                // process.exit(0);
            } else {
                throw new Error("Invalid Nostr Address");
            }
            // process.exit(0);
        } else {
            Logger.WriteLog("Reading data descriptor from file " + dataDescriptorFilename);

            dataDescriptorFileData = fs.readFileSync(dataDescriptorFilename);
            newDataDescriptor = new DerbyTools.DataDescriptor();
            newDataDescriptor.importDescriptor(JSON.parse(dataDescriptorFileData));

            Logger.WriteLog("Data descriptor loaded");
            // console.log(JSON.stringify(newDataDescriptor.generateDataDescriptorJSON(), undefined, 4));
            // Parse out any accidental and intentional directories
            let filenameLabel = CommandLineMode.filenameout;
 
            if (CommandLineMode.displayinfoonly){
                // console.log("Display Info Only");
                displayDescriptorInfo(newDataDescriptor);

                process.exit(0);
            } else {
                downloadFromDataDescriptor(newDataDescriptor, filenameLabel);
            }
            
    

            // if (!filenameLabel && (newDataDescriptor.metadata.filename || newDataDescriptor.metadata.filename.length > 0)){
            //     let descriptorInPath = newDataDescriptor.metadata.filename.split('/');
    
            //     if (descriptorInPath && descriptorInPath.length > 0){
            //         filenameLabel = descriptorInPath[descriptorInPath.length - 1];
            //     }
            // } else {
            //     Logger.WriteLog("File output overridden");
            // }
    
            // if (!filenameLabel){
            //     filenameLabel = newDataDescriptor.merkelRoot + ".file";
            // }
    
            // Logger.WriteLog("File will be saved to " + filenameLabel);
    
            // let newDownloader = new DerbyTools.TransferManager.DownloadTransferManager();
            // newDownloader.setDataDescriptor(newDataDescriptor);
    
            // Logger.WriteLog("Storage nodes listed for download: " + newDownloader.getListOfRelays());
    
            // newDownloader.downloadFileData((err, binaryArray) => {
            //     if (!err){
            //         Logger.WriteLog("Download completed");
            //         if (binaryArray && Array.isArray(binaryArray) && binaryArray.length > 0){
            //             let rawData = DerbyTools.BlobTools.combineData(binaryArray, newDataDescriptor.metadata.size);
        
            //             Logger.WriteLog(binaryArray.length + " blocks combined into " + rawData.length + " bytes");
    
            //             Logger.WriteLog("Saving file to " + filenameLabel);
            //             fs.writeFileSync(filenameLabel, rawData);
    
            //             // process.exit(0);
            //             setTimeout(() => {
            //                 process.exit(0);
            //             }, 1000);
            //         } else {
            //             throw new Error("Error downloading data");
            //         }
            //     } else {
            //         throw err;
            //     }
            // }, (numOfBlocksDownloaded, blockDownloaded, size, total) => {
            //     let percentageComplete = Math.ceil((numOfBlocksDownloaded / total) * 100);
                
            //     Logger.WriteLog("Downloaded hash " + newDataDescriptor.blobMap[blockDownloaded][1] + " from Pointer id " + 
            //     newDataDescriptor.blobMap[blockDownloaded][0], Logger.DEBUG);
    
            //     Logger.WriteLog(percentageComplete + '% Complete' + ' - Block ' + blockDownloaded + ' (' + size + ' bytes) downloaded')
            // });
        }

    } else if (CommandLineMode.mode == "nostr") {
        const fs = require('fs');
        if (CommandLineMode.eventflow == "toevent"){
            let descriptorFileName = CommandLineMode.descriptorin;
            let eventfile = CommandLineMode.eventfileout;
            let nostrsk = CommandLineMode.nostrkey;
            let relayList = CommandLineMode.relaylist;
            let testRun = CommandLineMode.testrun;

            let descriptorFileData = fs.readFileSync(descriptorFileName);
            let descriptorFileJSON = JSON.parse(descriptorFileData);

            let newDescriptor = new DerbyTools.DataDescriptor();
            newDescriptor.importDescriptor(descriptorFileJSON);

            let descriptorEvent = DerbyTools.NostrDescriptor.createEventFromDataDescriptor(newDescriptor,nostrsk);

            if (eventfile) {
                if (eventfile.toLowerCase() == "stdout"){
                    console.log(JSON.stringify(descriptorEvent, undefined, 4));
                } else {
                    Logger.WriteLog("Saving event to file: " + eventfile);
                    fs.writeFileSync(eventfile, JSON.stringify(descriptorEvent, undefined, 4));    
                }
            }
            if (relayList) {
                Logger.WriteLog("Publishing to relays " + relayList);

                if (testRun){
                    let nAddress = DerbyTools.NostrDescriptor.getNAddrFromEvent(descriptorEvent, relayList);
    
                    Logger.WriteLog("NAddress is " + nAddress);
                } else {
                    // Publish to Relays

                    NostrDescriptorClient.publishDescriptorEvents(relayList, descriptorEvent, (err, success) => {
                        let nAddress = DerbyTools.NostrDescriptor.getNAddrFromEvent(descriptorEvent, relayList);
        
                        Logger.WriteLog("NAddress is " + nAddress);

                        setTimeout(() => {
                            process.exit(0);
                        }, 1000);
                    });
                    
                }
            }

            // process.exit(0);
        } else if (CommandLineMode.eventflow == "fromevent") {
            let descriptorFileName = CommandLineMode.descriptorout;
            let eventfile = CommandLineMode.eventfilein;
            let nAddress = CommandLineMode.naddr;

            if (eventfile) {
                let eventFileData = fs.readFileSync(eventfile);
                let eventFileJSON = JSON.parse(eventFileData);

                let newDescriptor = DerbyTools.NostrDescriptor.importDescriptorFromEvent(eventFileJSON);

                if (newDescriptor) {
                    let dataDescriptorString = JSON.stringify(newDescriptor.generateDataDescriptorJSON(),
                    undefined, 4);
                    if (descriptorFileName == "stdout"){
                        console.log(dataDescriptorString);
                    } else {
                        Logger.WriteLog("Saving data descriptor to file: " + descriptorFileName);
                        fs.writeFileSync(descriptorFileName, dataDescriptorString);
                    }

                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                } else {
                    throw new Error ("Error parsing Event");
                }
            } else if (nAddress) {
                Logger.WriteLog("Retrieving descriptor data from Nostr Address " + nAddress);
                NostrDescriptorClient.getNostrDescriptorByNAddress(nAddress, (err, nostrEvent) => {
                    if (!err){
                        let nAddressDescriptor = DerbyTools.NostrDescriptor.importDescriptorFromEvent(nostrEvent);
                        let nAddressDescriptorString = JSON.stringify(nAddressDescriptor.generateDataDescriptorJSON(), undefined, 4)

                        if (descriptorFileName == "stdout") {
                            console.log(nAddressDescriptorString);
                        } else {
                            Logger.WriteLog("Saving data descriptor to file: " + descriptorFileName);
                            fs.writeFileSync(descriptorFileName, nAddressDescriptorString);
                        }
                    } else {
                        throw new Error("Error getting descriptor from nAddress");
                    }

                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                });
            }

            // process.exit(0);
        }
    } else if (CommandLineMode.mode == "remove"){
        const fs = require('fs');
        console.log(CommandLineMode);

        Logger.WriteLog("Removal mode selected");
        let isNostrAddress = false;
        let dataDescriptorFilename = CommandLineMode.descriptorin;
        let nAddress;
        let dataDescriptorFileData;
        let newDataDescriptor;

        if (dataDescriptorFilename.toLowerCase().startsWith('nostr:')){
            // Grab nostr event
            // Proceed with removal process
            // Remove Event if removal is set up
            let nAddressURI = dataDescriptorFilename.toLowerCase().split(':');

            if (nAddressURI.length == 2) {

                isNostrAddress = true;
                nAddress = nAddressURI[1];

                Logger.WriteLog("Reading data descriptor from Nostr address " + nAddress);

                NostrDescriptorClient.getNostrDescriptorByNAddress(nAddress, (err, newEvent) => {
                    if (!err) {
                        let newDataDescriptor = DerbyTools.NostrDescriptor.importDescriptorFromEvent(newEvent);

                        removeFromDataDescriptor(newDataDescriptor, () => {

                        });

                    } else {
                        throw err;
                    }

                });
            } else {
                throw new Error("Invalid Nostr Address");
            }

        } else {
            Logger.WriteLog("Reading data descriptor from file " + dataDescriptorFilename);

            let dataDescriptorFileData = fs.readFileSync(dataDescriptorFilename);
            newDataDescriptor = new DerbyTools.DataDescriptor();
            newDataDescriptor.importDescriptor(JSON.parse(dataDescriptorFileData));

            removeFromDataDescriptor(newDataDescriptor, () => {

            });
        }
    } else if (CommandLineMode.mode == "networkkeys"){
        if (CommandLineMode.generatekeys) {
            Logger.WriteLog("Generating Key Pair\n");
            Logger.WriteLog("NOTE: Please save this key pair in a safe place");
            Logger.WriteLog("Your Public Key will be your identity on storage nodes and can be distributed");
            Logger.WriteLog("Your Private Key will be used for uploading and managing data. DO NOT SHARE THIS KEY");

            let newPrivateHexKey = DerbyTools.PointerTools.generatePrivateKey();
            let newPublicHexKey = DerbyTools.PointerTools.getPublicKey(newPrivateHexKey);

            let derbyNetworkKey = DerbyTools.Bech32Code.encodeNetworkPublicKey(newPublicHexKey);
            let derbySecretKey = DerbyTools.Bech32Code.encodeNetworkPrivateKey(newPrivateHexKey);

            Logger.WriteLog("\nNew Network Key Pair");
            Logger.WriteLog("Public Key: " + derbyNetworkKey);
            Logger.WriteLog("Private Key: " + derbySecretKey);

            process.exit(0);
        } else if (CommandLineMode.getpublickey) {
            let dsecKey = CommandLineMode.getpublickey;

            try {
                if (DerbyTools.Bech32Code.isEncodedPrivateKey(dsecKey)){
                    let privateKeyHex = DerbyTools.Bech32Code.decodeNetworkPrivateKey(dsecKey);
                    let publicKeyHex = DerbyTools.PointerTools.getPublicKey(privateKeyHex);
                    let derby1Key = DerbyTools.Bech32Code.encodeNetworkPublicKey(publicKeyHex);
    
                    Logger.WriteLog("Derived Public Network Key: " + derby1Key);
    
                    process.exit(0)
                } else {
                    throw new Error("Invalid dsec key");
                }
            } catch (e) {
                throw e;
            }
        } else if (CommandLineMode.gethexkey) {
            let thisBechString = CommandLineMode.gethexkey;
            let decodedHexString;

            try {
                if (DerbyTools.Bech32Code.isEncodedPublicKey(thisBechString)){
                    decodedHexString = DerbyTools.Bech32Code.decodeNetworkPublicKey(thisBechString);
                } else if (DerbyTools.Bech32Code.isEncodedPrivateKey(thisBechString)){
                    decodedHexString = DerbyTools.Bech32Code.decodeNetworkPrivateKey(thisBechString);
                } else {
                    throw new Error("Invalid key format");
                }

                Logger.WriteLog("Hex format: " + decodedHexString);
                process.exit(0);
            } catch (e) {
                throw e;
            }
        } else if (CommandLineMode.getderbykey || CommandLineMode.getderbysecret) {
            let hexString;
            let derbyKey;

            try {
                if (CommandLineMode.getderbykey){
                    if (CommandLineMode.getderbykey.length == 64) {
                        Logger.WriteLog("Getting Derby Public Key");
                        hexString = CommandLineMode.getderbykey;

                        derbyKey = DerbyTools.Bech32Code.encodeNetworkPublicKey(hexString);
                    } else {
                        throw new Error("Invalid hex key");
                    }
                } else {
                    if (CommandLineMode.getderbysecret.length == 64) {
                        Logger.WriteLog("Getting Derby Private Key");
                        hexString = CommandLineMode.getderbysecret;

                        derbyKey = DerbyTools.Bech32Code.encodeNetworkPrivateKey(hexString);
                    } else {
                        throw new Error("Invalid hex key");
                    }
                }

                Logger.WriteLog("Network Key: " + derbyKey);
                process.exit(0);
            } catch (e) {
                throw e;
            }

        }
    }
    else if (CommandLineMode.mode == "help"){
        const fs = require('fs');
        // console.info("Print --help");
        let CommandLineHelp = fs.readFileSync("commandlineswitches.txt");
    
        // console.log(CommandLineHelp.toString());
    }

} catch (e) {
    console.error(e);
    process.exit(1);
}

function displayDescriptorInfo(newDescriptor) {
    if (newDescriptor){
        let newDownloader = new DerbyTools.TransferManager.DownloadTransferManager();
        newDownloader.setDataDescriptor(newDescriptor);
        let totalSizeString;
        let storageNodeListString = "";
        let fileLabelString = (newDescriptor.metadata.filename || newDescriptor.metadata.filename != "") ? newDescriptor.metadata.filename : "Not Specified";
        let merkelRoot = newDescriptor.merkelRoot;
        let streamableString = newDescriptor.metadata.streamable ? "Yes" : "No";
        let mimeTypeString = (newDescriptor.metadata.mimetype || newDescriptor.metadata.mimetype != "") ? newDescriptor.metadata.mimetype : "Not Specified";
        let numberOfBlocks = newDescriptor.blobMap.length;
        let AverageBlockSize = Math.floor(newDescriptor.metadata.size / numberOfBlocks).toString() + " Bytes";

        if (newDescriptor.metadata.size >= 1000 && newDescriptor.metadata.size < 1000000) {
            totalSizeString = Math.ceil(newDescriptor.metadata.size / 1000).toString() + " KB";
        } else if (newDescriptor.metadata.size >= 1000000 && newDescriptor.metadata.size < 1000000000) {
            totalSizeString = Math.ceil(newDescriptor.metadata.size / 1000000).toString() + " MB";
        } else if (newDescriptor.metadata.size >= 1000000000) {
            totalSizeString = Math.ceil(newDescriptor.metadata.size / 1000000000).toString() + " GB";
        } else {
            totalSizeString = newDescriptor.metadata.size.toString() + " Bytes";
        }

        newDownloader.getListOfRelays().forEach(thisNodeURL => {
            storageNodeListString += "\t" + thisNodeURL + "\n";
        });

        console.log("\nData Descriptor Information\n");
        console.log("-------------------------\n");
        console.log("File Label: " + fileLabelString);
        console.log("Total Size: " + totalSizeString);
        console.log("Streamable Content: " + streamableString);
        console.log("Content Type: " + mimeTypeString);
        console.log("Merkel Root Hash: " + merkelRoot);
        console.log("Number of Data Blocks: " + numberOfBlocks);
        console.log("Average Block Size: " + AverageBlockSize);
        console.log("Total Storage Node List:\n" + storageNodeListString);
    }
}

function removeFromDataDescriptor(newDataDescriptor, callback){
    Logger.WriteLog("Removal not implemented yet");
    // Will piggy back on Transfer Manager Download Manager for Deletion OR make its own class

    // try {
    //     if (newDataDescriptor){
    //         // Steps
    //         // Step 1 Collect pointer IDs from all blocks
    //         // Step 2 Connect to each Relay and submit a pointer deletion
    //         // Step 3 Send a callback with 
    //     }
    // } catch (e) {
    //     callback(e);
    // }

    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

function downloadFromDataDescriptor(newDataDescriptor, filenameLabel){
    const fs = require('fs');
    if (!filenameLabel && (newDataDescriptor.metadata.filename || newDataDescriptor.metadata.filename.length > 0)){
        let descriptorInPath = newDataDescriptor.metadata.filename.split('/');

        if (descriptorInPath && descriptorInPath.length > 0){
            filenameLabel = descriptorInPath[descriptorInPath.length - 1];
        }
    } else {
        Logger.WriteLog("File output overridden");
    }

    if (!filenameLabel || filenameLabel.toLowerCase().startsWith("nostr:")){
        filenameLabel = newDataDescriptor.merkelRoot + ".file";
    }

    Logger.WriteLog("File will be saved to " + filenameLabel);

    let newDownloader = new DerbyTools.TransferManager.DownloadTransferManager();
    newDownloader.setDataDescriptor(newDataDescriptor);

    Logger.WriteLog("Storage nodes listed for download: " + newDownloader.getListOfRelays());

    newDownloader.downloadFileData((err, binaryArray) => {
        if (!err){
            Logger.WriteLog("Download completed");
            if (binaryArray && Array.isArray(binaryArray) && binaryArray.length > 0){
                let rawData = DerbyTools.BlobTools.combineData(binaryArray, newDataDescriptor.metadata.size);

                Logger.WriteLog(binaryArray.length + " blocks combined into " + rawData.length + " bytes");

                Logger.WriteLog("Saving file to " + filenameLabel);
                fs.writeFileSync(filenameLabel, rawData);

                // process.exit(0);
                setTimeout(() => {
                    process.exit(0);
                }, 1000);
            } else {
                throw new Error("Error downloading data");
            }
        } else {
            throw err;
        }
    }, (numOfBlocksDownloaded, blockDownloaded, size, total) => {
        let percentageComplete = Math.ceil((numOfBlocksDownloaded / total) * 100);
        
        Logger.WriteLog("Downloaded hash " + newDataDescriptor.blobMap[blockDownloaded][1] + " from Pointer id " + 
        newDataDescriptor.blobMap[blockDownloaded][0], Logger.DEBUG);

        Logger.WriteLog(percentageComplete + '% Complete' + ' - Block ' + blockDownloaded + ' (' + size + ' bytes) downloaded')
    });
}

function createNodePool(relayURLList, callback){
    let messageManagerList = [];
    let counter = 0;

    for (let i = 0; i < relayURLList.length; i++){
        let thisRelayURL = relayURLList[i];
        let thisRelayClient = new DerbyTools.RelayTools.RelayClient(thisRelayURL);
        
        thisRelayClient.on("CONNECT", () => {
            counter++;
            messageManagerList.push(new DerbyTools.RelayTools.MessageManager(thisRelayClient));
            Logger.WriteLog("Connected to storage node " + thisRelayClient.relayURL);

            if (counter == relayURLList.length){
                callback(messageManagerList);
            }
        });

        thisRelayClient.on("ERROR", () => {
            counter++;

            Logger.WriteLog("Error connecting to storage node " + thisRelayClient.relayURL, Logger.WARNING);
            if (counter == relayURLList.length){
                callback(messageManagerList);
            }
        });

        thisRelayClient.connect();
    }

    return messageManagerList;
}