import { rtConnect, rtDisconnect, rtSubscribe, rtUnsubscribe, rtFeed, historical, formatTime } from 'truedata-nodejs';
import sha256 from "crypto-js/sha256.js";
import dotenv from "dotenv";
import moment from "moment";
import axios from "axios";
import WebSocket from "ws";

dotenv.config();

const LOSS_P_VALUE = 1.25;
const PROFIT_VALUE = 2.25;
const QUANTITY = 50;

const sleep = (ms) => new Promise(rs => setTimeout(rs, ms * 1000));

function calDesiredValue(atm) {
    const v = (atm.lp % 100);
    return (atm.lp - v) + 50
}

function calSL(price, lossPer) {
    const v = price - (price / 10);
    const sl = v + ((v / 10) / lossPer)
    return {
        v: v.toFixed(1), sl: sl.toFixed(1)
    }
}

axios.interceptors.request.use(req => {
    console.log(`${req.method} ${req.url} ${req.data}`);
    // Important: request interceptors **must** return the request.
    return req;
});
// Add a response interceptor
axios.interceptors.response.use(response => {
    if (response.status === 200) {
        if (response.data.success || response.data.status) {
            return response.data;
        } else {
            return response.data;
        }
    }
}, error => {
    let errorObj = {};

    if (error.response) {
        errorObj.status = error.response.status;
        errorObj.message = error.response.statusText;
        errorObj.data = error.response.data;
    } else {
        errorObj.status = 500;
        errorObj.message = "Error";
    }


    return Promise.reject(errorObj);
});

class TrueData {
    constructor({
        user = process.env.TRUEDATA_USER,
        pwd = process.env.TRUEDATA_PWD,
        port = process.env.TRUEDATA_PORT
    } = {}) {
        this.user = user;
        this.pwd = pwd;
        this.port = port;
    }
    async start({ symbols = (process.env.symbols?.split(",")) || [], tickHandler, barHandler }) {
        rtConnect(this.user, this.pwd, symbols, this.port, 0, 0, 0);
        rtFeed.on('tick', tickHandler); // Receives Tick data    
        rtFeed.on('bar', barHandler); // Receives 1min  
    }
}

class Finvasia {
    constructor({
        userid = process.env.FINVASIA_userid,
        password = process.env.FINVASIA_password,
        twoFA = process.env.FINVASIA_twoFA,
        vendor_code = process.env.FINVASIA_vendor_code,
        api_secret = process.env.FINVASIA_api_secret,
        imei = process.env.FINVASIA_imei
    } = {}) {

        this.userid = userid;
        this.password = password;
        this.twoFA = twoFA;
        this.vendor_code = vendor_code;
        this.api_secret = api_secret;
        this.imei = imei;
        this.__susertoken = "57adf78491e607686e46895544595a7ae315f882d251b26a81fad68daff0ac16";
        this.apiConfig = {
            "endpoint": "https://shoonyatrade.finvasia.com/NorenWClientTP",
            "websocket": "wss://shoonyatrade.finvasia.com/NorenWSTP/",
            "eodhost": "https://shoonya.finvasia.com/chartApi/getdata/",
            "debug": false,
            "timeout": 7000
        }
        this.routes = {
            'authorize': '/QuickAuth',
            'logout': '/Logout',
            'forgot_password': '/ForgotPassword',
            'watchlist_names': '/MWList',
            'watchlist': '/MarketWatch',
            'watchlist_add': '/AddMultiScripsToMW',
            'watchlist_delete': '/DeleteMultiMWScrips',
            'placeorder': '/PlaceOrder',
            'modifyorder': '/ModifyOrder',
            'cancelorder': '/CancelOrder',
            'exitorder': '/ExitSNOOrder',
            'orderbook': '/OrderBook',
            'tradebook': '/TradeBook',
            'singleorderhistory': '/SingleOrdHist',
            'searchscrip': '/SearchScrip',
            'TPSeries': '/TPSeries',
            'optionchain': '/GetOptionChain',
            'holdings': '/Holdings',
            'limits': '/Limits',
            'positions': '/PositionBook',
            'scripinfo': '/GetSecurityInfo',
            'getquotes': '/GetQuotes',
        }
    }
    async api(route, params) {
        let url = this.apiConfig.endpoint + this.routes[route];
        let payload = 'jData=' + JSON.stringify(params);
        payload = payload + `&jKey=${this.__susertoken}`;
        return axios.post(url, payload);
    }
    async login() {
        try {
            let pwd = sha256(this.password).toString();
            let u_app_key = `${this.userid}|${this.api_secret}`;
            let app_key = sha256(u_app_key).toString();
            let authparams = {
                "source": "API",
                "apkversion": "js:1.0.0",
                "uid": this.userid,
                "pwd": pwd,
                "factor2": this.twoFA,
                "vc": this.vendor_code,
                "appkey": app_key,
                "imei": this.imei
            };
            let auth_data = await this.api("authorize", authparams);
            this.__susertoken = auth_data.susertoken;
        } catch (e) {
            console.log(e);
        }
    }
    async searchscrip(exchange, searchtext) {
        let values = {};
        values["uid"] = this.userid;
        values["exch"] = exchange;
        values["stext"] = searchtext;
        let reply = await this.api("searchscrip", values, this.__susertoken);
        return await Promise.all(reply.values.map(async v => {
            const t = await this.get_quotes(v.exch, v.token);
            return t;
        }))
    }
    async get_quotes(exchange, token) {
        let values = {};
        values["uid"] = this.userid;
        values["exch"] = exchange;
        values["token"] = token
        return await this.api("getquotes", values, this.__susertoken);
    }
    async place_order(order) {
        let values = {
            'ordersource': "API",
            'uid': this.userid,
            'actid': this.userid,
            'trantype': order.trantype || "B",
            "prd": "M",
            "exch": "NFO",
            "tsym": order.symbol,
            "qty": order.quantity.toString(),
            "dscqty": "0",
            "prctyp": "LMT",
            "prc": order.price.toString(),
            "remarks": "",
            "ret": "DAY"
        }
        return await this.api("placeorder", values, this.__susertoken);
    }
    async modify_order(info) {
        let values = {
            'ordersource': 'API',
            "uid": this.userid,
            'actid': this.userid,
            "norenordno": info.orderno,
            "exch": "NFO",
            "tsym": info.tsym,
            "prc": info.newPrice,
            "qty": info.quantity.toString(),
        };
        return await this.api("modifyorder", values, this.__susertoken);
    }
    async cancel_order(orderno) {
        let values = {
            "ordersource": "API",
            "uid": this.userid,
            "norenordno": orderno
        }
        return await this.api("cancelorder", values, this.__susertoken);
    }
    async get_order_book() {
        let values = {
            "uid": this.userid,
        }
        return await this.api("orderbook", values, this.__susertoken);
    }
    async streaming(payload = {}) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.apiConfig.websocket, { rejectUnauthorized: false });
            this.ws.onopen = (evt) => {

                this.streamingInterval = setInterval(() => { let _hb_req = '{"t":"h"}'; this.ws.send(_hb_req); }, this.apiConfig.timeout);

                let values = {
                    "t": "c",
                    "uid": this.userid,
                    "actid": this.userid,
                    "susertoken": this.__susertoken,
                    "source": "API"
                };
                this.ws.send(JSON.stringify(values));
                resolve()
            };
            this.ws.onerror = async (evt) => {
                if (this.streamingInterval) clearInterval(this.streamingInterval);
                console.log("error::", JSON.stringify(evt));
                await this.retryConnection({ waitFor: 5 });
                await this.streaming(payload);
                reject(evt)
            };
            this.ws.onclose = async (evt) => {
                if (this.streamingInterval) clearInterval(this.streamingInterval);
                console.log("Socket closed", JSON.stringify(evt));
                await this.retryConnection();
                await this.streaming(payload);
            };
        });
    }
    async retryConnection({ waitFor = 2 } = {}) {
        await sleep(waitFor);
        await this.login();
    }
}

async function run() {
    const tsym = {}, pendingOrders = {}, sellOrders = {};
    const fv = new Finvasia();

    await fv.login();
    
    const orderbook = await fv.get_order_book();
    orderbook?.map(ob => {
        if (ob?.status === "OPEN") {
            if (ob.trantype === "B") {
                pendingOrders[ob.norenordno] = {
                    ...ob,
                    placedAt: (ob.ordenttm * 1000) || (new Date()).getTime()
                };
            }
            if (ob.trantype === "S") {
                sellOrders[ob.norenordno] = { ...calSL(Number(ob.prc), LOSS_P_VALUE), tsym: ob.tsym, quantity: ob.qty };
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
        // if (result.t == 'tk' || result.t == 'tf') {
        //     console.log("quote", [result]);
        // }
        // if (result.t == 'dk' || result.t == 'df') {
        //     console.log("quote", [result]);
        // }
        if (result.t == 'om') {
            if (result.reporttype === "New") {

                if (result.trantype === "B") {
                    pendingOrders[result.norenordno] = {
                        ...result,
                        placedAt: (new Date()).getTime()
                    };
                }

                if (result.trantype === "S") {
                    sellOrders[result.norenordno] = { ...calSL(Number(result.prc), LOSS_P_VALUE), tsym: result.tsym, quantity: result.qty };
                }
            }
            if(result.reporttype === "Replaced") {
                if (result.trantype === "S") {
                    sellOrders[result.norenordno] = { ...calSL(Number(result.prc), LOSS_P_VALUE), tsym: result.tsym, quantity: result.qty };
                }
            }
            if (result.reporttype === "Fill") {
                if (result.trantype === "B") {
                    delete pendingOrders[result.norenordno];

                    fv.place_order({
                        symbol: result.tsym,
                        quantity: result.qty,
                        price: String(Number(result.flprc) + Number(PROFIT_VALUE)),
                        trantype: "S"
                    }).catch(console.error)

                }
                if (result.trantype === "S") {
                    delete sellOrders[result.norenordno];
                }
            }
            if(["REJECTED", "rejected"].includes(result.status.toLowerCase())) {
                if (result.trantype === "B") {
                    delete pendingOrders[result.norenordno];
                }
                if (result.trantype === "S") {
                    delete sellOrders[result.norenordno];
                }
            }
            if(result.reporttype === "CancelRejected") {
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

    const option = "PE";

    const [atm] = await fv.searchscrip("NSE", 'NIFTY 50');
    const niftyStrikePrice = calDesiredValue(atm);

    const [atms] = await fv.searchscrip("NFO", `NIFTY ${moment().format('MMM').toUpperCase()} ${niftyStrikePrice} ${option}`);
    tsym[`NIFTY${moment(atms.exd, "DD-MMM-YYYY").format("YYMMDD")}${niftyStrikePrice}${option}`] = atms.tsym;

    const symbols = Object.keys(tsym);

    console.log(`-----------SYMBOLS---------`, symbols);

    let isLastCandleRed = {
        status: false,
        time: false
    }

    let Open = 0, lastSec;

    const td = new TrueData;
    td.start({
        symbols,
        tickHandler: (tick) => {

            const cTime = moment();

            console.log("tick", tick.LTP, tick.Timestamp, cTime.format("HH:mm:ss:SSS"));

            const cSec = cTime.format("ss");
            if (lastSec === cSec) return;

            if (cSec === "00" || (lastSec !== "00" && cSec === "01")) {
                Open = tick.LTP;
            }

            if (isLastCandleRed.status && (cSec === "58" || (lastSec !== "58" && cSec === "59")) && (Open > tick.LTP)) {
                lastSec = cSec;
                fv.place_order({
                    symbol: tsym[tick.Symbol],
                    quantity: String(QUANTITY),
                    price: String(tick.Ask) //tick.Ask
                }).catch(console.error)
            }
            lastSec = cSec;

            // Trail STOP LOSS,
            try {
                Object.keys(sellOrders).map(so => {
                    const order = sellOrders[so];
                    if (tick.LTP <= (Number(order.v) - Number(PROFIT_VALUE))) {
                        console.log("Modify", tick.LTP, order.v, so, order.sl, order.tsym)
                        fv.modify_order({
                            orderno: so,
                            newPrice: order.sl,
                            tsym: order.tsym,
                            quantity: order.quantity
                        }).catch(console.error);
                    }
                });
            } catch (e) {
                console.log("Trail stop loss:ERROR", e);
            }

            // Cancel the orders, if any order placed at 30 seconds before && still in pending mode.
            try {
                Object.keys(pendingOrders).map(po => {
                    if (cTime.diff(moment(pendingOrders[po].placedAt), "seconds") > 30) {
                        console.log("cancel_order", po, cTime, pendingOrders[po].placedAt);
                        fv.cancel_order(po).catch(console.error);
                        delete pendingOrders[po];
                    }
                });
            } catch (e) {
                console.log("Cancel order:ERROR", e);
            }
        },
        barHandler: (bar) => {
            if (bar.Open > bar.Close) {
                isLastCandleRed = {
                    status: true,
                    time: bar.Time
                }
                console.log({ color: 'red', ...bar })
            } else {
                isLastCandleRed = {
                    status: false,
                    time: bar.Time
                }
                console.log({ color: 'green', ...bar })
            }
        }
    });
}

run();