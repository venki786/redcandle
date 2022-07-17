import moment from "moment";
import Finvasia from "./fv";
import TD from "./td";

const fv = new Finvasia();

// await fv.login();

const option = "PE", tsym={};
try {
const [atm] = await fv.searchscrip("NSE", 'NIFTY 50');
const niftyStrikePrice = calDesiredValue(atm);

const [atms] = await fv.searchscrip("NFO", `NIFTY ${moment().format('MMM').toUpperCase()} ${niftyStrikePrice} ${option}`);
tsym[`NIFTY${moment(atms.exd, "DD-MMM-YYYY").format("YYMMDD")}${niftyStrikePrice}${option}`] = atms.tsym;

const symbols = Object.keys(tsym);

console.log(`-----------SYMBOLS---------`, symbols);

function calDesiredValue(atm) {
    const v = (atm.lp % 100);
    return (atm.lp - v) + (v > 50 ? 0 : 50)
}
} catch(e) {
    console.log(e)
}

const td = new TD();

td.connect({
    symbols: ["NIFTY22072116050PE"]
});

td.onTickHandler = (tick) => {
    console.log({ tick })
}

td.on1MinBarHandler = (bar) => {
    console.log({ "1MinBar": bar })
}