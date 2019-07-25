
/*
 *
 * Simple node convenience server for keeping a persistent bluetooth connection
 *
 */

const noble = require('noble-mac');
const bleat = require('bleat').webbluetooth;
const Ganglion = require('ganglion-ble').default;

const lsl = require('node-lsl');
const { Observable, from } = require('rxjs');
const { finalize } = require('rxjs/operators');

const Freq = require('frequency-counter')
const counter = new Freq(1)


async function ganglionConnect() {
    // patch
    global.navigator = {
        bluetooth: bleat
    };
    
    const ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();
    return ganglion
}


function streamLsl(client) {
    console.log('LSL: Creating Stream...');

    const info = lsl.create_streaminfo("Ganglion", "EEG", 1, 200, lsl.channel_format_t.cft_float32, "Muse");
    const desc = lsl.get_desc(info);
    lsl.append_child_value(desc, "manufacturer", "OpenBCI");
    const channels = lsl.append_child(desc, "channels");
    for (let i = 0; i < 4; i++) {
        const channel = lsl.append_child(channels, "channel");
        lsl.append_child_value(channel, "label", "CH"+(i+1));
        lsl.append_child_value(channel, "unit", "microvolts");
        lsl.append_child_value(channel, "type", "EEG");
    }

    const outlet = lsl.create_outlet(info, 0, 360);
    let sampleCounter = 0;

    client.stream
        .pipe(
            finalize(() => {
                lsl.lsl_destroy_outlet(outlet);
                clearInterval(keepaliveTimer);
            })
        )
        .subscribe(sample => {
            const data = sample.data.map(d => d*1000)
            const sampleData = new lsl.FloatArray(data);
            lsl.push_sample_ft(outlet, data, lsl.local_clock());
            sampleCounter++;
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(`LSL: Sent ${sampleCounter} samples`);;
        });
}

noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
        ganglionConnect()
            .then(streamLsl);
        // museConnect()
            // .then(streamLsl);
    }
});

noble.on('discover', function (peripheral) {
    console.log('Found device with local name: ' + peripheral.advertisement.localName);
    console.log('advertising the following service uuid\'s: ' + peripheral.advertisement.serviceUuids);
    console.log();
});

