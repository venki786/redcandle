import { WebSocket } from "ws";

export default class TD {
    constructor({
        username = process.env.TRUEDATA_USER,
        password = process.env.TRUEDATA_PWD,
        port = process.env.TRUEDATA_PORT,
    } = {}) {
        this.username = username;
        this.password = password;
        this.port = port;
        this.connectionUrl = 'wss://push.truedata.in:';
        this.reconnectionTime = 5000;
        this.disconnectConnection = false;
        this.touchlineMap = {};
    }
    connect({
        symbols = []
    } = {}) {
        console.log('Connecting..');
        const url = this.connectionUrl + this.port + '?user=' + this.username + '&password=' + this.password;
        console.log(url);
        try {
            this.connection = new WebSocket(url);

            this.connection.onopen = this.socketonopen.bind(this);
            this.connection.onerror = this.socketonerror.bind(this);
            this.connection.onmessage = (e) => {
                try {
                    const jsonObj = JSON.parse(e.data);
                    if (jsonObj.trade != null) {
                        const tradeArray = jsonObj.trade;
                        this.onTickHandler(handleRealTimeData(tradeArray, this.touchlineMap));
                    } else if (jsonObj.bar1min) {
                        const barArray = jsonObj.bar1min;
                        this.on1MinBarHandler(handleBarData(barArray, '1min', this.touchlineMap));
                    } else if (jsonObj.bar5min) {
                        const barArray = jsonObj.bar5min;
                        this.on5MinBarHandler(handleBarData(barArray, '5min', this.touchlineMap));
                    } else if (jsonObj.success) {
                        switch (jsonObj.message) {
                            case 'TrueData Real Time Data Service':
                                this.subscribe(symbols);
                                break;
                            case 'symbols added':
                                console.log(`Added Symbols:${jsonObj.symbolsadded}, Total Symbols Subscribed:${jsonObj.totalsymbolsubscribed}`);
                                jsonObj.symbollist.forEach((d) => {
                                    this.touchlineMap[d[1]] = d[0];
                                });
                                console.log(this.touchlineMap)
                                break;
                            case 'symbols removed':
                                console.log(`Removed Symbols:${jsonObj.symbolsremoved}, Symbols Subscribed:${jsonObj.totalsymbolsubscribed}`);
                                break;
                            case 'HeartBeat':
                                console.log('Message ' + jsonObj.message + ' Time: ' + jsonObj.timestamp);
                                break;
                            case 'marketstatus':
                                console.log('marketstatus', jsonObj.data)
                                break;
                            default: console.log(jsonObj);
                        }
                    }
                } catch (e) {
                    console.log("TD:onmessage", e);
                }
            };
            this.connection.onclose = this.socketonclose.bind(this);

            return true;
        } catch (error) {
            console.log(error);
            setInterval(this.connect.bind(this), this.reconnectionTime);
            return false;
        }
    }
    socketonopen() {
        console.log('Connected Websocket');
    }
    socketonerror() {
        console.log('Websocket Error ' + e.message);
    }
    socketonclose() {
        console.log('Disconnected Websocket');
        if (!this.disconnectConnection) setTimeout(this.connect.bind(this), this.reconnectionTime);
    }
    closeConnection() {
        this.connection.close();
    }
    disconnect = () => {
        this.disconnectConnection = true;
        this.closeConnection();
    }
    onTickHandler = (tick) => {
        console.log({ tick })
    }
    on1MinBarHandler = (bar) => {
        console.log({ "1MinBar": bar })
    }
    on5MinBarHandler = (bar) => {
        console.log({ "5MinBar": bar })
    }
    subscribe = (symbols) => {
        //for-loop to override max 65000 characters issue
        for (let i = 0; i <= symbols.length; i += 1500) {
            const jsonRequest = {
                method: 'addsymbol',
                symbols: symbols.slice(i, i + 1500),
            };
            let s = JSON.stringify(jsonRequest);
            this.connection.send(s);
        }
    }
    unSubscribe = (symbols) => {
        for (let i = 0; i <= symbols.length; i += 1500) {
            const jsonRequest = {
                method: 'removesymbol',
                symbols: symbols.slice(i, i + 1500),
            };
            let s = JSON.stringify(jsonRequest);
            this.connection.send(s);
        }
    }
}


function handleRealTimeData(tradeArray, touchlineMap) {
    return {
        Symbol: touchlineMap[tradeArray[0]],
        Symbol_ID: +tradeArray[0],
        Timestamp: tradeArray[1],
        LTP: +tradeArray[2],
        LTQ: +tradeArray[3],
        ATP: +tradeArray[4],
        Volume: +tradeArray[5],
        Open: +tradeArray[6],
        High: +tradeArray[7],
        Low: +tradeArray[8],
        Prev_Close: +tradeArray[9],
        OI: +tradeArray[10],
        Prev_Open_Int_Close: +tradeArray[11],
        Day_Turnover: +tradeArray[12],
        Special: tradeArray[13],
        Tick_Sequence_No: +tradeArray[14],
        Bid: tradeArray[15] !== undefined ? +tradeArray[15] : "Deactivated",
        Bid_Qty: tradeArray[16] !== undefined ? +tradeArray[16] : "Deactivated",
        Ask: tradeArray[17] !== undefined ? +tradeArray[17] : "Deactivated",
        Ask_Qty: tradeArray[18] !== undefined ? +tradeArray[18] : "Deactivated",
    };
}

function handleBarData(barArray, bar, touchlineMap) {
    return {
        Symbol: touchlineMap[barArray[0]],
        SymbolId: barArray[0],
        Bar: bar,
        Time: barArray[1],
        Open: +barArray[2],
        High: +barArray[3],
        Low: +barArray[4],
        Close: +barArray[5],
        Volume: +barArray[6],
        OI: +barArray[7],
    };
}
