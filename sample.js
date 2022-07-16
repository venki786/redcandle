
async function runApi() {
    const rawResponse = await fetch("https://shoonyatrade.finvasia.com/NorenWClientTP/PositionBook", {
        body: `jData={"uid":"FA64551", "actid":"FA64551"}&jKey=635cb47fc4407234734482ded015b64c1f64637d8c98ab91dbd291dd3fc7375c`,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        method: "POST"
    })

    console.log(rawResponse)
    const content = await rawResponse.json();
    console.log(content);
}
console.log(await runApi());