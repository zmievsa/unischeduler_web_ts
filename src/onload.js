function deleteErrorElement() {
    elems = document.getElementsByClassName("error");
    if (elems.length) elems[0].parentElement.removeChild(elems[0]);
    return true;
}
$(document).keypress(function (e) {
    if (e.which == 13)
        $(".submit-btn").click();
});
function save(data, filename, filetype) {
    var blob = new Blob([data], { type: filetype });
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveBlob(blob, filename);
    }
    else {
        var elem = window.document.createElement('a');
        elem.href = window.URL.createObjectURL(blob);
        elem.download = filename;
        document.body.appendChild(elem);
        elem.click();
        document.body.removeChild(elem);
    }
}
async function convert() {
    let schedule;
    try {
        schedule = await convertToIcal($('textarea[name="schedule"]').val(), $('input[name="isUCF"]').prop("checked"));
        save(schedule, "Classes.ics", "text/calendar");
    } catch (error) {
        console.log(error)
        $('#error').text(error)
        $('#divError').prop("style", "display: inline-block;")
    }
}
$(function () {
    $('#submit-btn').bind('click', function () {
        $('#submit-btn').prop("value", "Loading...")
        $('#error').text("")
        $('#divError').prop("style", "display: none;")
        $('#submit-btn').prop("value", "Submit")
        convert()
        return false;
    });
});