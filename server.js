import moment from "moment";

import TD from "./scripts/td";
import Finvasia from "./scripts/fv";

let preferredHours = ["10", "11", "12"];
let modify_order_sl_intervals = [0, 5 * 60, 15 * 60, 5 * 60, 5 * 60, 5 * 60, 5 * 60, 5 * 60, 5 * 60];
let QUANTITY = 100;
let PROFIT_VALUE = 2.25;
let LOSS_P_VALUE = 1;
let LOSS_AFTER_VALUE = 1;

let trending = "C";

const fv = new Finvasia();

const tsym = {}, pendingOrders = {}, sellOrders = {}, partialOrders=[];

await fv.login();

const orderbook = await fv.get_order_book();
const dateValue = new Date();
!orderbook.emsg && orderbook.map(ob => {
    // console.log({ob}, "\n");
    if (ob.remarks?.includes("redcandle") && ob?.status === "OPEN") {

        if (ob.trantype === "B") {
            pendingOrders[ob.norenordno] = {
                ...ob,
                placedAt: (dateValue).getTime()
            };
        }
        if (ob.trantype === "S") {
            sellOrders[ob.norenordno] = { tsym: ob.tsym, quantity: ob.qty, placedAt: (dateValue).getTime(), price: ob.prc, realprc: ob.prc, modifyCount: 1 };
        }
    }
});
console.log("init", pendingOrders, sellOrders);

await fv.streaming();

fv.ws.onmessage = (evt) => {

    var result = JSON.parse(evt.data);
    console.log({ onmessage: result });

    if (result.t == 'ck') {
        console.log("open", [result]);
    }
    if (result.t == 'om' && result.remarks?.includes("redcandle")) {
        if (result.reporttype === "New") {

            if (result.trantype === "B") {
                pendingOrders[result.norenordno] = {
                    ...result,
                    placedAt: (new Date()).getTime()
                };
            }

            if (result.trantype === "S") {
                sellOrders[result.norenordno] = { tsym: result.tsym, quantity: result.qty, placedAt: (new Date()).getTime(), price: result.prc, realprc: result.prc, modifyCount: 1 };
            }
        }
        if (result.reporttype === "Replaced") {
            if (result.trantype === "S") {
                sellOrders[result.norenordno] = {
                    ...(sellOrders[result.norenordno] || {}),
                    tsym: result.tsym,
                    quantity: result.qty,
                    placedAt: (new Date()).getTime(),
                    price: result.prc,
                    modifyCount: sellOrders[result.norenordno]?.modifyCount ? sellOrders[result.norenordno].modifyCount + 1 : 1
                };
            }
        }
	if(result.reporttype === "Fill") {
		if(result.trantype === "B") {
			partialOrders.push(result.norenordno);
		}
	}
        if (result.reporttype === "Fill" && result.status === "COMPLETE") {
            if (result.trantype === "B") {
                fv.place_order({
                    symbol: result.tsym,
                    quantity: result.qty,
                    price: String(Number(result.flprc) + Number(PROFIT_VALUE)),
                    trantype: "S"
                }).catch(console.error);
                delete pendingOrders[result.norenordno];

            }
            if (result.trantype === "S") {
                delete sellOrders[result.norenordno];
            }
        }
        if (["REJECTED", "rejected"].includes(result.status.toLowerCase())) {
            if (result.trantype === "B") {
                delete pendingOrders[result.norenordno];
            }
            if (result.trantype === "S") {
                delete sellOrders[result.norenordno];
            }
        }
        if (result.reporttype === "CancelRejected") {
            if (result.trantype === "B") {
                delete pendingOrders[result.norenordno];
            }
            if (result.trantype === "S") {
                delete sellOrders[result.norenordno];
            }
        }
        console.log(JSON.stringify([pendingOrders, sellOrders]));
    }
};

const [atm] = await fv.searchscrip("NSE", 'NIFTY 50');
const niftyStrikePrice = calDesiredValue(atm);

const [peatms] = await fv.searchscrip("NFO", `NIFTY ${moment().format('MMM').toUpperCase()} ${niftyStrikePrice} PE`);
tsym[`NIFTY${moment(peatms.exd, "DD-MMM-YYYY").format("YYMMDD")}${niftyStrikePrice}PE`] = peatms.tsym;

const [ceatms] = await fv.searchscrip("NFO", `NIFTY ${moment().format('MMM').toUpperCase()} ${niftyStrikePrice} CE`);
tsym[`NIFTY${moment(ceatms.exd, "DD-MMM-YYYY").format("YYMMDD")}${niftyStrikePrice}CE`] = ceatms.tsym;

const symbols = Object.keys(tsym);

console.log(`-----------SYMBOLS---------`, symbols);

const td = new TD();

td.connect({ symbols });

const symbolsFac = {};

symbols.map(s => {
    symbolsFac[s] = {
        isLastCandleRed: {
            status: false,
            time: (new Date())
        },
        Open: 0
    }
})


td.onTickHandler = (tick) => {

    const indSym = symbolsFac[tick.Symbol];
    if (!indSym) return;

    const cTime = moment();
    const cSec = cTime.format("ss");

    if (indSym.stopSameSecond === cSec) return;
    indSym.stopSameSecond = cSec;

    if (cSec === "00" || (indSym.setOpenSec !== "00" && cSec === "01")) {
        indSym.Open = tick.LTP;
    }
    indSym.setOpenSec = cSec;

    const cHour = cTime.format("HH");
    const cMinute = cTime.format("mm");

    if (indSym.Open && preferredHours.includes(cHour) && indSym.isLastCandleRed.status && (cSec === "58" || (indSym.lastSec !== "58" && cSec === "59")) && (indSym.Open > tick.LTP) && Number(cMinute) > 5) {
        indSym.lastSec = cSec;
        fv.place_order({
            symbol: tsym[tick.Symbol],
            quantity: String(QUANTITY),
            price: String(tick.LTP - 0.05),
        }).catch(console.error)
    }
    indSym.lastSec = cSec;

    // Cancel the orders, if any order placed at given seconds before && still in pending mode.
    try {
        Object.keys(pendingOrders).map(po => {
            if (pendingOrders[po].tsym === tsym[tick.Symbol] && cTime.diff(moment(pendingOrders[po].placedAt), "seconds") > 20 && !partialOrders.includes(po)) {
                fv.cancel_order(po).catch(console.error);
                delete pendingOrders[po];
            }
        });
    } catch (e) {
        console.log("Cancel order:ERROR", e);
    }
}

td.on1MinBarHandler = (bar) => {
    if (bar.Open > bar.Close) {
        symbolsFac[bar.Symbol].isLastCandleRed = {
            status: true,
            time: bar.Time,
            diff: bar.Open - bar.Close
        }
        console.log({ color: 'red', ...bar, diff: bar.Open - bar.Close })
    } else {
        symbolsFac[bar.Symbol].isLastCandleRed = {
            status: false,
            time: bar.Time
        }
        console.log({ color: 'green', ...bar })
    }
    try {
        const cTime = moment();
        Object.keys(sellOrders).map(so => {
            const order = sellOrders[so];
            if (
                order.tsym === tsym[bar.Symbol]
                && modify_order_sl_intervals[order.modifyCount]
                && cTime.diff(moment(order.placedAt), "seconds") > modify_order_sl_intervals[order.modifyCount]
            ) {
                const newPrice = Number(order.price) - (order.modifyCount > 1 ? LOSS_AFTER_VALUE : LOSS_P_VALUE);
                console.log("modify_order_after_time", so, order.placedAt, cTime, order.price, newPrice);
                fv.modify_order({
                    orderno: so,
                    newPrice: String(newPrice < bar.Close ? bar.Close : newPrice),
                    tsym: order.tsym,
                    quantity: order.quantity
                }).catch(console.error);
            }
        });
        try {
            Object.keys(sellOrders).map(so => {
                const order = sellOrders[so];
                if (order.tsym === tsym[bar.Symbol] && (Number(order.realprc) - Number(bar.Low)) >= 15) {
                    console.log("<<<<<<<<<<<<modify_order_sl_21>>>>>>>>>>>>>", so, order.placedAt, cTime, order.price, order.realprc);
                    fv.modify_order({
                        orderno: so,
                        newPrice: String(bar.Close + 7),
                        tsym: order.tsym,
                        quantity: order.quantity
                    }).catch(console.error);
                }
            });
        } catch (e) {
            console.log("Trail stop loss:ERROR", e);
        }
    } catch (e) {
        console.log("Trail stop loss:ERROR", e);
    }
}

export default {
    port: 3000,
    fetch(request) {
        if (request.method === "POST") {
            const params = Object.fromEntries((new URLSearchParams(request.url)).entries());
            if(params.trending && ["CE", "PE"].includes(params.trending)) {
                trending = params.trending;
            }
            // ws.send(JSON.stringify(params));
        }
        return new Response("Welcome!");
    },
};

function calDesiredValue(atm) {
    const v = (atm.lp % 100);
    return (atm.lp - v) + (v > 50 ? 50 : 0)
}
