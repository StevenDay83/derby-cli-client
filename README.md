# derby-cli-client
Derby storage network command-line client

## Usage
```
derby-cli - Commandline file transfer utility for the derby storage protocol

Usage: node index.js [mode] [options...]
node index.js --download --descriptor-input {descriptor file | nostr:naddr1} [options...]
node index.js --upload --input [filename] --secret-key [key] --storage-nodes [server1,...,serverN] [options...] 
--descriptor-output [filename]
node index.js --nostr {--to-event | --from-event} [options...]

--upload                        Set mode to upload. Used to upload files to the derby storage nodes

Upload Options:

--input <filename>                  File to upload
--secret-key <key>                  64-character hex secret key for signing upload pointers
--storage-nodes <server list>       Storage nodes to upload file to. (i.e. ws://server1,wss://server2)            
--block-size-bytes                  Maximum size to break file data into for upload (default is 512000)
--mime-type                         Optional. Set mime-type on data descriptor
--dfilename                         Set suggested filename label in data descriptor.
--descriptor-output                 File to save data generated data descriptor. Use 'stdout' to print
                                    output.

--download                      Set mode to download. Used to retrieve files from derby storage notes
                                based on data descriptor information

Download Options:

--descriptor-input                  Data descriptor input. Will read from a file unless 'nostr:' prefix is used.
                                    For 'nostr:' prefixes, cli will read from an naddr1 bech-32 string and pull 
                                    a descriptor from Nostr.
--filename-output                   Optional. Override file label in data descriptor. If none is specified the merkelroot 
                                    hash will be used.
--display-info                      Retrieves and shows data descriptor information in human readable format. If
                                    --filename-out is specified, this will be ignored.

--nostr                         Set mode to Nostr. Use to convert to and from a data descriptor and Nostr Event 
                                and to publish a data descriptor to Nostr.

Nostr Options:

--to-event                          Sets Nostr sub-mode to convert a data descriptor to a Nostr event.
--descriptor-input                      Data descriptor input. Will read from a specified file.
--nostr-key                             Nostr secret key. Used to sign a new Nostr event. Currently only accepted
                                        in hex format.
--event-file-output                     Event output. Will save to a file or standard output if 'stdout' is specified.
--publish-to-relays                     Nostr relays to publish event to. (i.e. wss://relay.damus.io,wss://wbc.nostr1.com).
                                        Note: A Nostr Address (naddr1) will be displayed after publishing.
--test-run                              Will simulate publishing to Nostr relay. This will display a Nostr Address (naddr1).

--from-event                        Sets Nostr sub-mode to convert a Nostr event to a data descriptor.

--descriptor-output                     File to save converted data descriptor. Use 'stdout' to print output.
`
--naddr                                 Nostr address in bech-32 format (i.e. naddr1...) to retrieve Nostr
                                        event data descriptor.
--event-file-input                      Load file with event data. Use if not pulling event fron naddress.

```

## Quick Setup

If you are pulling the latest from source, make sure to download [Derby Tools](https://github.com/StevenDay83/derby-tools) and place the derby-tools directory in the derby-cli directory.

* Go into the derby-tools directory and run a npm install to pull down modules
* Do the same in the root directory

You can alternatively download the zip file, which will have all the modules loaded.

## How to use the cli

**Do not use this for any data you care about or in production in any way right now.**

To use the cli utility, you will need one or more storage nodes to connect to. You can download a storage node to use [Here] (https://github.com/StevenDay83/derby-storage-relay)

You will need a secret key for uploading to a storage node and if you publish to a nostr relay your secret key in hex format (nsec not supported right now).

A storage node key is a 256-bit hex key. Example *a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e*

The CLI has 4 modes:

Upload - For uploading to a storage nodes
Download - For downloading from storage nodes
Remove - For removal of data association *(Not implemented as of 11/22/2023)*
Nostr - For converting and publishing data descriptors

## Example

Assuming the following:
* ws://localhost:8080 as the storage relay
* Secret key is a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
* Nostr relays wss://relay.damus.io and wss://wbc.nostr1.com
* Nostr key is also a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e

### Upload
Uploading a file to a storage relay:

`node index.js --upload --input bitcoin.pdf --secret-key 8c5925dc9bfd7b096a391dcb04f24923f416e06cab36c78bf4ead2f19c1fa408 --storage-nodes ws://nostr.messagepush.io:8081 --block-size-bytes 1000000 --mime-type "application/pdf" --dfilename bitcoin.pdf --descriptor-output bitcoin.pdf.map.json`

You should see the following output:

```
Upload Mode Selected
Connecting to storage nodes
Connected to storage node ws://localhost:8080
Successfully connected to 1 storage nodes
Reading file bitcoin.pdf
Broke data into 1 chunks
Published pointer 1ef0de93ce10ea16f3e8bcbaddc54a18c85229ffd641ed1fb64f5247ce404fd9
Upload Progress 100% (1 blocks of 1)
Upload completed
Saving data descriptor to bitcoin.pdf.map.json
```

### Download
Downloading a file from a storage relay

`node index.js --download --descriptor-input bitcoin.pdf.map.json`

You should see the following output:

```
Download Mode Selected
Reading data descriptor from file bitcoin.pdf.map.json
Data descriptor loaded
File will be saved to bitcoin.pdf
Storage nodes listed for download: ws://localhost:8080
Downloaded hash b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553 from Pointer id 503831b7671b8c450c90608a5f407b7d584acc33bd8c615e6f2e5d0f4635f9ae
100% Complete - Block 0 (184292 bytes) downloaded
Download completed
1 blocks combined into 184292 bytes
Saving file to bitcoin.pdf
```

### Publishing to Nostr
You can convert your data descriptor to a Nostr event using the Nostr mode. You can use `--test-run` to validate the event and settings before publishing

Convert to a nostr event:

`node index.js --nostr --to-event --descriptor-input /Users/stevenday/incoming/bitcoin.pdf.map.json --publish-to-relays wss://relay.damus.io,wss://wbc.nostr1.com --nostr-key a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e --event-file-output stdout`

The event has been written to standard output instead of a file. You should see:

```
{
    "mode": "nostr",
    "eventflow": "toevent",
    "testrun": true,
    "descriptorin": "/Users/stevenday/incoming/bitcoin.pdf.map.json",
    "nostrkey": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    "eventfileout": "stdout",
    "relaylist": [
        "wss://relay.damus.io",
        "wss://wbc.nostr1.com"
    ]
}
{
    "kind": 37337,
    "pubkey": "98c39ac0d91ff4cea6e79ae5836e50868c47191bca0fbfd2a6838d303665f506",
    "created_at": 1700677591,
    "content": "[[\"503831b7671b8c450c90608a5f407b7d584acc33bd8c615e6f2e5d0f4635f9ae\",\"b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553\",[\"ws://nostr.messagepush.io:8081\"],184292]]",
    "tags": [
        [
            "d",
            "0b19cda5f68c7769a2bbb1c96f070f8d3cc6aa54d360383297effadceebe21b5"
        ],
        [
            "m",
            "application/pdf"
        ],
        [
            "streamable",
            "false"
        ],
        [
            "l",
            "bitcoin.pdf"
        ],
        [
            "size",
            "184292"
        ]
    ],
    "id": "67a9f0075fcbc019f13b39dbf9d965e0f930f9e7030d6bf22240ce391bcbf58f",
    "sig": "b2b4c2210228b24a64cff2e09b97e7ed07f5d96db67df20a01369dee3bbd96a8d5968235a26f64e52e5074c3c23209ac1a3a4a131cf10a9657399a7425e56042"
}
Publishing to relays wss://relay.damus.io,wss://wbc.nostr1.com
NAddress is naddr1qpqrqc33893kgcf4vcmrscehxumrjcfjvf3xyvtr8ymxvvphxpnrsepnvd3nvctpx56xgvekxqensvej8ymk2enxv9jxxet9vfjnyvtzx5q3gamnwvaz7tmjv4kxz7fwv3sk6atn9e5k7qg5waehxw309amkycewdehhxarjxyhxxmmdqgsf3su6crv3laxw5mne4evrdeggdrz8rydu5ral62ng8rfsxejl2psrqsqqpywem90s5t
```

### Downloading from an naddress

You can use the naddress to download a file.

Nostr addresses must have the `nostr:` prefix or it will try to load a file from disk.

You can check the contents of a data descriptor by doing the following with the `--display-info` switch:

`node index.js --download --descriptor-input nostr:naddr1qpqrqc33893kgcf4vcmrscehxumrjcfjvf3xyvtr8ymxvvphxpnrsepnvd3nvctpx56xgvekxqensvej8ymk2enxv9jxxet9vfjnyvtzx5q3gamnwvaz7tmjv4kxz7fwv3sk6atn9e5k7qg5waehxw309amkycewdehhxarjxyhxxmmdqgsf3su6crv3laxw5mne4evrdeggdrz8rydu5ral62ng8rfsxejl2psrqsqqpywem90s5t --display-info`

You should see the following:

```
Download Mode Selected
Reading data descriptor from Nostr address naddr1qpqrqc33893kgcf4vcmrscehxumrjcfjvf3xyvtr8ymxvvphxpnrsepnvd3nvctpx56xgvekxqensvej8ymk2enxv9jxxet9vfjnyvtzx5q3gamnwvaz7tmjv4kxz7fwv3sk6atn9e5k7qg5waehxw309amkycewdehhxarjxyhxxmmdqgsf3su6crv3laxw5mne4evrdeggdrz8rydu5ral62ng8rfsxejl2psrqsqqpywem90s5t

Data Descriptor Information

-------------------------

File Label: bitcoin.pdf
Total Size: 185 KB
Streamable Content: No
Content Type: application/pdf
Merkel Root Hash: 0b19cda5f68c7769a2bbb1c96f070f8d3cc6aa54d360383297effadceebe21b5
Number of Data Blocks: 1
Average Block Size: 184292 Bytes
Total Storage Node List:
	ws://localhost:8080
```

Removing the `--display-info` tag will download the same as using a descriptor file from disk:

```
Download Mode Selected
Reading data descriptor from Nostr address naddr1qpqrqc33893kgcf4vcmrscehxumrjcfjvf3xyvtr8ymxvvphxpnrsepnvd3nvctpx56xgvekxqensvej8ymk2enxv9jxxet9vfjnyvtzx5q3gamnwvaz7tmjv4kxz7fwv3sk6atn9e5k7qg5waehxw309amkycewdehhxarjxyhxxmmdqgsf3su6crv3laxw5mne4evrdeggdrz8rydu5ral62ng8rfsxejl2psrqsqqpywem90s5t
File will be saved to bitcoin.pdf
Storage nodes listed for download: ws://localhost:8080
Downloaded hash b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553 from Pointer id 503831b7671b8c450c90608a5f407b7d584acc33bd8c615e6f2e5d0f4635f9ae
100% Complete - Block 0 (184292 bytes) downloaded
Download completed
1 blocks combined into 184292 bytes
Saving file to bitcoin.pdf
```

## In early development

This is in very early development. Things WILL break.

From any issues please submit on github or reach out to me on Nostr [npub1pwtrrydty95q5ces0tkm2r7hkqfe9jwxhmmee5xwke6g4lz70l7sd8pf5t](https://snort.social/nprofile1qqsqh933jx4jz6q2vvc84md4pltmqyuje8rtaauu6r8tvay2l308llgpzemhxue69uhk2er9dchxummnw3ezumrpdejz7qgewaehxw309amk2mrrdakk2tnwdaehgu3wwa5kuef0qyg8wumn8ghj7mn0wd68ytnddakj7wmd2x9)


