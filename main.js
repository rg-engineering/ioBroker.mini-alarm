/*
 * mini-alarm adapter f�r iobroker
 *
 * Created: 03.04.2020 21:31:28
 *  Author: Rene

*/




/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
const utils = require("@iobroker/adapter-core");

let adapter;

/** @type {number | null } */
let ArmTimer = null;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: "mini-alarm",
        //#######################################
        //
        ready: function () {
            try {
                //adapter.log.debug("start");
                main();
            }
            catch (e) {
                adapter.log.error("exception catch after ready [" + e + "]");
            }
        },
        //#######################################
        //  is called when adapter shuts down
        unload: function (callback) {
            try {
                adapter && adapter.log && adapter.log.info && adapter.log.info("cleaned everything up...");

                callback();
            } catch (e) {
                callback();
            }



        },
        //#######################################
        //
        SIGINT: function () {
            adapter && adapter.log && adapter.log.info && adapter.log.info("cleaned everything up...");

        },
        //#######################################
        //  is called if a subscribed object changes
        //objectChange: function (id, obj) {
        //    adapter.log.debug("[OBJECT CHANGE] ==== " + id + " === " + JSON.stringify(obj));
        //},
        //#######################################
        // is called if a subscribed state changes
        stateChange: function (id, state) {
            //adapter.log.debug("[STATE CHANGE] ==== " + id + " === " + JSON.stringify(state));
            HandleStateChange(id, state);
        },
        //#######################################
        //
        /*
        message: async (obj) => {
            if (obj) {
                switch (obj.command) {

                    default:
                        adapter.log.error("unknown message " + obj.command);
                        break;
                }
            }
        }
        */
    });
    adapter = new utils.Adapter(options);

    return adapter;
}
        


//#######################################
//
async function main() {
    try {
        adapter.log.debug("sensors " + JSON.stringify(adapter.config.sensors));
        adapter.log.debug("actors " + JSON.stringify(adapter.config.actors));

        await CreateDatepoints();

        await SubscribeStates();

    }
    catch (e) {
        adapter.log.error("exception in  main [" + e + "]");
    }

}

//#######################################
//
// create all necessary datapaoints
// will be called at ecery start of adapter
async function CreateDatepoints() {

    adapter.log.debug("start CreateDatepoints");


    try {
        await adapter.setObjectNotExistsAsync("State", {
            type: "state",
            common: {
                name: "State",
                role: "value",
                type: "string",
                unit: "",
                read: true,
                write: false
            },
            native: { id: "State" }
        });

        await adapter.setStateAsync("State", { ack: true, val: "disarmed" });

        await adapter.setObjectNotExistsAsync("ArmAll", {
            type: "state",
            common: {
                name: "ArmAll",
                role: "button",
                type: "boolean",
                unit: "",
                read: false,
                write: true
            },
            native: { id: "ArmAll" }
        });

        await adapter.setObjectNotExistsAsync("Disarm", {
            type: "state",
            common: {
                name: "Disarm",
                role: "button",
                type: "boolean",
                unit: "",
                read: false,
                write: true
            },
            native: { id: "Disarm" }
        });

        for (let i = 1; i <= adapter.config.NumberOfZones; i++) {
            await adapter.setObjectNotExistsAsync("ArmZone"+i, {
                type: "state",
                common: {
                    name: "ArmAZone"+i,
                    role: "button",
                    type: "boolean",
                    unit: "",
                    read: false,
                    write: true
                },
                native: { id: "ArmZone"+i }
            });
        }

    }
    catch (e) {
        adapter.log.error("exception in  CreateDatepoints [" + e + "]");
    }

}

//#######################################
//
// subscribe thermostate states to be informed when target or current is changed
/**
 * @param {(() => void) | undefined} [callback]
 */
function SubscribeStates(callback) {

    //if we need to handle actors, then subscribe on current and target temperature
    adapter.log.debug("#start subscribtion ");

    try {
        adapter.subscribeStates("ArmAll");
        adapter.subscribeStates("Disarm");

        for (let i = 1; i <= adapter.config.NumberOfZones; i++) {
            adapter.subscribeStates("ArmZone"+i);
        }



        adapter.log.debug("#subscribtion finished");
    }
    catch (e) {
        adapter.log.error("exception in SubscribeStates [" + e + "]");
    }
    if (callback) callback();
}

//*******************************************************************
//
// handles state changes of subscribed states

let LastStateChangeID = "";
let LastStateVal = 1;

/**
 * @param {string} id
 * @param {{ ack: boolean; val: string | number; }} state
 */
async function HandleStateChange(id, state) {

    adapter.log.debug("### handle state change " + id + " " + JSON.stringify(state));

    try {

        if (state && state.ack !== true) {
            //first set ack flag
            await adapter.setStateAsync(id, { ack: true });
        }

        if (id !== LastStateChangeID || state.val !== LastStateVal) {

            adapter.log.debug("### " + id + " " + LastStateChangeID + " " + state.val + " " + LastStateVal);


            let bHandled = false;
            LastStateChangeID = id;
            LastStateVal = state.val;


            const ids = id.split("."); 


            if (ids[2] === "Disarm") {
                await Disarm();
                bHandled = true;
            }
            else if (ids[2] === "ArmAll") {
                await Arm(-1);
                bHandled = true;
            }
            else if (ids[2].includes("Arm")) {

                const zone = parseInt(ids[2].substring(7));
                await Arm(zone);
                bHandled = true;
            }


            if (!bHandled) {
                adapter.log.debug("### not handled " + id + " " + JSON.stringify(state));
            }
            else {
                adapter.log.debug("### all StateChange handled ");
            }

        }
        else {
            adapter.log.debug("### state change already handled: " + LastStateVal + " / " + state.val + " /// " + id + " / " + LastStateChangeID);
        }
    }
    catch (e) {
        adapter.log.error("exception in HandleStateChange [" + e + "]");
    }
}

async function Disarm() {

    adapter.log.info("all zones disarmed ");

    await adapter.setStateAsync("State", { ack: true, val: "disarmed" });

    UnsubscribeSensors();
}


function UnsubscribeSensors() {

    if (ArmTimer != null) {
        clearTimeout(ArmTimer);
        ArmTimer = null;
    }

    for (let i = 0; i < adapter.config.sensors.length; i++) {
        adapter.subscribeStates(adapter.config.sensors[i].OID);
        adapter.log.debug("unsubscribe " + JSON.stringify(adapter.config.sensors[i]));
    }

}

/**
 * @param { number} zone
 */
async function Arm(zone) {

    if (adapter.config.DelayBeforeArm > 0) {
        await adapter.setStateAsync("State", { ack: true, val: "arming" });
        ArmTimer = setTimeout(Arm2, adapter.config.DelayBeforeArm*1000,zone);

    }
    else {
        await Arm2(zone);
    }
}

/**
 * @param { number} zone
 */
async function Arm2(zone) {

    ArmTimer = null;

    if (zone < 0) {
        adapter.log.info("arm all zones ");
        await adapter.setStateAsync("State", { ack: true, val: "armed" });
        SubscribeSensors(-1);
    }
    else {
        adapter.log.info("arm zone " + zone);
        SubscribeSensors(zone);
    }

    await adapter.setStateAsync("State", { ack: true, val: "armed" });
}


/**
 * @param {number} zone
 */
function SubscribeSensors(zone) {

    if (zone < 0) {
        for (let i = 0; i < adapter.config.sensors.length; i++) {
            adapter.log.debug("subscribe " + JSON.stringify(adapter.config.sensors[i]));
            adapter.subscribeStates(adapter.config.sensors[i].OID);
        }
    }
    else {
        const sensors = adapter.config.sensors.filter(d => parseInt(d.Zone) === zone);
        
        for (let i = 0; i < sensors.length; i++) {
            adapter.log.debug("subscribe " + JSON.stringify(sensors[i]));
            adapter.subscribeStates(sensors[i].OID);
        }

    }

}


// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}