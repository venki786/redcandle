import sha256 from "crypto-js/sha256.js";

export default class Finvasia {
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
        this.__susertoken = "8e94f9a0f1b5c2c1955b23571f9ebb5bcd77934cb8b1160b3700d4a8cd401af9";
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
    async apiold(route, params) {
        let url = this.apiConfig.endpoint + this.routes[route];
        let payload = 'jData=' + JSON.stringify(params);
        payload = payload + `&jKey=${this.__susertoken}`;
        return axios.post(url, payload);
    }
    async api(route, params) {
        try {
            const rawResponse = await fetch(`${this.apiConfig.endpoint}${this.routes[route]}`, {
                body: `jData=${JSON.stringify(params)}&jKey=${this.__susertoken}`,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                method: "POST"
            });
            console.log({rawResponse})
            return await rawResponse.json();
        } catch(e) {
            throw e;
        }        
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
        if(!reply) return [];
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
            "remarks": "redcandle",
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
    async get_positions() {
        let values = {
            "uid": this.userid,
            "actid": this.userid,
        }
        return await this.api("positions", values, this.__susertoken);
    }
}