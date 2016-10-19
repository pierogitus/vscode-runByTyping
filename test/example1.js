
exports.getData = function (d) {
    return d + 1
}

exports.slow = function() {
    var r = 0
        r += Math.sqrt(i) 
    }
    return r
}

exports.page = function(){
    return '<html><body>' + 
        [10,20,30,40,50].map(x => '<div style="font-size:' + x +'px">' + x + '</div>').join('')
     + '</body></html>'
}