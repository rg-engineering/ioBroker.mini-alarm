/*
 * mini-alarm adapter für iobroker
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
let AlarmState = "undefined";
let ArmedZone = 0;

/** @type {number | null } */
let ArmTimer = null;
/** @type {number | null} */
let AlarmTimer = null;

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

        AlarmState = "disarmed";
        ArmedZone = 0;
        await adapter.setStateAsync("State", { ack: true, val: AlarmState });

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
            else {
                bHandled = await CheckForAlarm(id, state);
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
    AlarmState = "disarmed";
    ArmedZone = 0;
    await adapter.setStateAsync("State", { ack: true, val: AlarmState });
    OffAllAlarmDevices();
    UnsubscribeSensors();
}


async function CheckForAlarm(id, state) {

    let bRet = false;

    if (AlarmState === "armed" && state.val === true) {

        adapter.log.debug("check for alarm ");

        //find device and zone
        const sensors = adapter.config.sensors.filter(d => d.OID === id);

        for (let i = 0; i < sensors.length; i++) {
            bRet = true; //statechange handled
            if (ArmedZone === - 1 || sensors[i].Zone === ArmedZone) {
                await PrepareForAlarm();
            }
        }
    }
    return bRet;

}

/**
 * @param {number} zone
 */
async function CheckAllClosed(zone) {
    let bRet = true;

    let sStatus = "";
    try {
        if (zone == -1) {
            for (let i = 0; i < adapter.config.sensors.length; i++) {
                const temp = await adapter.getForeignStateAsync(adapter.config.sensors[i].OID);

                if (temp == null) {
                    adapter.log.error(adapter.config.sensors[i].OID + " not found " + JSON.stringify(temp));
                }

                if (temp != null && temp.val) {
                    bRet = false;
                    adapter.log.info(adapter.config.sensors[i].name + " not closed " + JSON.stringify(temp));

                    if (sStatus.length == 0) {
                        sStatus = "not armed, still open:";
                    }
                    sStatus += " " + adapter.config.sensors[i].name;

                }
            }
        }
        else {


            const sensors = adapter.config.sensors.filter(d => parseInt(d.Zone) === zone);

            for (let i = 0; i < sensors.length; i++) {
                const temp = await adapter.getForeignStateAsync(sensors[i].OID);


                if (temp == null) {
                    adapter.log.error(sensors[i].OID + " not found " + JSON.stringify(temp));
                }
                if (temp != null && temp.val) {
                    bRet = false;
                    adapter.log.info(sensors[i].name + " not closed " + JSON.stringify(temp));

                    if (sStatus.length == 0) {
                        sStatus = "not armed, still open:";
                    }
                    sStatus += " " + adapter.config.sensors[i].name;
                }
            }

        }
    }
    catch (e) {
        adapter.log.error("exception in CheckAllClosed [" + e + "]");
    }

    if (sStatus.length > 0) {

        AlarmState = "arm not possible";
        await adapter.setStateAsync("State", { ack: true, val: sStatus });
    }

    return bRet;
}


async function PrepareForAlarm() {




    if (adapter.config.DelayBeforeAlarm > 0) {

        if (AlarmTimer === null) {

            AlarmState = "pre-alarm";
            await adapter.setStateAsync("State", { ack: true, val: AlarmState });

            AlarmTimer = setTimeout(Alarm, adapter.config.DelayBeforeAlarm * 1000);
        }
    }
    else {
        await Alarm();
    }

}

async function Alarm() {
    adapter.log.debug("Alarm on Zone " + ArmedZone);

    AlarmState = "alarm";
    await adapter.setStateAsync("State", { ack: true, val: AlarmState });

    if (ArmedZone === -1) {
        for (let i = 0; i < adapter.config.actors.length; i++) {
            await adapter.setForeignStateAsync(adapter.config.actors[i].OID, { ack: true, val: true });
            adapter.log.debug("alarm on " + adapter.config.actors[i].Name);
        }
    }
    else {
        const actors = adapter.config.actors.filter(d => parseInt(d.Zone) === ArmedZone);

        for (let i = 0; i < actors.length; i++) {
            await adapter.setForeignStateAsync(actors[i].OID, { ack: true, val: true });
            adapter.log.debug("alarm on " + actors[i].Name);
        }
    }

}

async function OffAllAlarmDevices() {
    for (let i = 0; i < adapter.config.actors.length; i++) {
        await adapter.setForeignStateAsync(adapter.config.actors[i].OID, { ack: true, val: false });
        adapter.log.debug("switch off " + adapter.config.actors[i].Name);
    }

}

function UnsubscribeSensors() {

    if (ArmTimer != null) {
        clearTimeout(ArmTimer);
        ArmTimer = null;
    }

    for (let i = 0; i < adapter.config.sensors.length; i++) {
        adapter.unsubscribeForeignStates(adapter.config.sensors[i].OID);
        adapter.log.debug("unsubscribe " + JSON.stringify(adapter.config.sensors[i]));
    }

}

/**
 * @param { number} zone
 */
async function Arm(zone) {


    const allClosed = await CheckAllClosed(zone);
    if (allClosed) {

        if (adapter.config.DelayBeforeArm > 0) {

            AlarmState = "arming";
            await adapter.setStateAsync("State", { ack: true, val: AlarmState });
            ArmTimer = setTimeout(Arm2, adapter.config.DelayBeforeArm * 1000, zone);

        }
        else {
            await Arm2(zone);
        }
    }
}

/**
 * @param { number} zone
 */
async function Arm2(zone) {

    ArmTimer = null;

    if (zone < 0) {
        adapter.log.info("arm all zones ");
        SubscribeSensors(-1);
    }
    else {
        adapter.log.info("arm zone " + zone);
        SubscribeSensors(zone);
    }
    ArmedZone = zone;
    AlarmState = "armed";
    await adapter.setStateAsync("State", { ack: true, val: AlarmState });
}


/**
 * @param {number} zone
 */
function SubscribeSensors(zone) {

    if (zone < 0) {
        for (let i = 0; i < adapter.config.sensors.length; i++) {
            adapter.log.debug("subscribe " + JSON.stringify(adapter.config.sensors[i]));
            adapter.subscribeForeignStates(adapter.config.sensors[i].OID);
        }
    }
    else {
        const sensors = adapter.config.sensors.filter(d => parseInt(d.Zone) === zone);
        
        for (let i = 0; i < sensors.length; i++) {
            adapter.log.debug("subscribe " + JSON.stringify(sensors[i]));
            adapter.subscribeForeignStates(sensors[i].OID);
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