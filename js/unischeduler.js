"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var ical = require("ical-generator");
var axios_1 = require("axios");
var jssoup_1 = require("jssoup");
// Good luck figuring this out!
var reClassName = /[A-Z]{3}[A-Z]* \d+[A-Z]? - .+/g;
var reClassSection = /(?:(?<sectionType>[A-Z][a-z]+)\n)?(?<weekdays>(?:[A-Z][a-z])+)\s+(?<startTime>\d\d?:\d\d(?:AM|PM))\s+-\s+(?<endTime>\d\d?:\d\d(?:AM|PM))\n(?<location>.+)\n(?<professors>\D+)(?<dtstart>[\d/]+)\s+-\s+(?<dtend>[\d/]+)/;
// Yes, they MUST be separate and CANNOT be combined
// Otherwise, js can sometimes remove necessary newlines
var reLeadingLineWhitespace = /(^\s+)/gm;
var reEndingLineWhitespace = /(\s+$)/gm;
var reNewlines = /\n+/gm;
var reClassTime = /(?<hours>\d+)(?::)(?<minutes>\d+)(?<isAfterNoon>PM)?/;
var TZ_UTC = "UTC";
var TZ_NEW_YORK = "America/New_York";
var NUMBER_OF_MILLIS_IN_DAY = 86400000;
var SchedulerError = /** @class */ (function (_super) {
    __extends(SchedulerError, _super);
    function SchedulerError(m) {
        var _this = _super.call(this, m) || this;
        // Set the prototype explicitly.
        Object.setPrototypeOf(_this, SchedulerError.prototype);
        return _this;
    }
    return SchedulerError;
}(Error));
function createClassSection(className, type, weekdays, startTime, endTime, location, professors, dtstart, dtend) {
    var byDay = weekdays.match(/../g); // type: day[]
    return {
        summary: className + " " + type,
        start: makeDateTime(dtstart, startTime),
        end: makeDateTime(dtstart, endTime),
        location: location,
        description: "Professors: " + professors.replace(/\n/gm, ''),
        repeating: {
            freq: "WEEKLY",
            byDay: byDay,
            until: new Date(dtend)
        }
    };
}
function makeDateTime(date, time) {
    var timeInfo = reClassTime.exec(time).groups;
    var datetime = new Date(date);
    datetime.setHours(parseInt(timeInfo.hours) + (timeInfo.isAfterNoon ? 12 : 0));
    datetime.setMinutes(parseInt(timeInfo.minutes));
    return datetime;
}
// MAIN
function convertToIcal(schedule, isUCF) {
    return __awaiter(this, void 0, void 0, function () {
        var class_sections, firstSectionStartDate, year, term, no_school_events, exdates, _i, class_sections_1, section;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    schedule = schedule.trim();
                    if (!schedule)
                        throw new SchedulerError("You inputted an empty schedule.");
                    class_sections = parseSchedule(schedule);
                    if (!class_sections)
                        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.");
                    firstSectionStartDate = class_sections[0].start;
                    year = firstSectionStartDate.getFullYear();
                    term = getSectionTerm(firstSectionStartDate);
                    if (!isUCF) return [3 /*break*/, 2];
                    return [4 /*yield*/, scrap_no_school_events(year, term)];
                case 1:
                    no_school_events = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    no_school_events = [];
                    _a.label = 3;
                case 3:
                    exdates = make_timeless_exdates(no_school_events);
                    for (_i = 0, class_sections_1 = class_sections; _i < class_sections_1.length; _i++) {
                        section = class_sections_1[_i];
                        add_exdates(section, exdates);
                    }
                    return [2 /*return*/, ical({ name: "Classes " + term + " " + year, timezone: TZ_NEW_YORK }).toString()];
            }
        });
    });
}
function getSectionTerm(sectionDate) {
    var start_month = sectionDate.getMonth();
    if (7 <= start_month || start_month <= 9)
        return "Fall";
    else if (0 <= start_month || start_month <= 2)
        return "Spring";
    else
        return "Summer";
}
function make_timeless_exdates(no_school_events) {
    var dates = [];
    for (var _i = 0, no_school_events_1 = no_school_events; _i < no_school_events_1.length; _i++) {
        var noSchoolEvent = no_school_events_1[_i];
        var day_count = (noSchoolEvent.end.getTime() - noSchoolEvent.start.getTime()) / NUMBER_OF_MILLIS_IN_DAY;
        if (day_count > 1)
            for (var i = 0; i < day_count + 1; i++) {
                var newDate = new Date(noSchoolEvent.start.valueOf());
                newDate.setDate(newDate.getDate() + i);
                dates.push(newDate);
            }
        else
            dates.push(noSchoolEvent.start);
    }
    return dates;
}
function add_exdates(icalEvent, exdates) {
    var hours = icalEvent.start.getHours();
    var minutes = icalEvent.start.getMinutes();
    var exdatesCopies = [];
    for (var _i = 0, exdates_1 = exdates; _i < exdates_1.length; _i++) {
        var exdate = exdates_1[_i];
        var newDate = new Date(exdate.getTime());
        newDate.setHours(hours);
        newDate.setMinutes(minutes);
        exdatesCopies.push(newDate);
    }
    icalEvent.repeating.exclude = exdatesCopies;
}
// PARSING
function parseSchedule(schedule) {
    schedule = normalizeWhitespace(schedule);
    var classNames = schedule.match(reClassName); // getAllRegexMatches(schedule, reSummary);
    var classSectionBatches = schedule.split(reClassName);
    classSectionBatches.shift(); // classSectionBatches[0] == ''
    var all_class_sections = [];
    for (var i = 0; i < classNames.length; i++) {
        var rawSectionBatch = classSectionBatches[i];
        // TODO: What if we get an online class without datetimes? Is the regex enough to handle such cases?
        // TODO: What if the class info somehow contains dropped/withdrawn but in some other section? Ex: Prof name
        if (rawSectionBatch.includes("Dropped") || rawSectionBatch.includes("Withdrawn"))
            continue;
        var sectionBatch = getAllRegexMatches(rawSectionBatch, reClassSection);
        var sectionType = void 0;
        var lastSectionType = void 0;
        for (var _i = 0, sectionBatch_1 = sectionBatch; _i < sectionBatch_1.length; _i++) {
            var section = sectionBatch_1[_i];
            var info = section.groups;
            if (sectionType = info === null || info === void 0 ? void 0 : info.sectionType)
                lastSectionType = sectionType;
            all_class_sections.push(createClassSection(classNames[i], lastSectionType, info.weekdays, info.startTime, info.endTime, info.location, info.professors, info.dtstart, info.dtend));
        }
    }
    return all_class_sections;
}
function normalizeWhitespace(str) {
    return str.replace(reLeadingLineWhitespace, '').replace(reEndingLineWhitespace, '').replace(reNewlines, "\n");
}
function getAllRegexMatches(str, regex) {
    var matches = [];
    var match;
    while ((match = regex.exec(str)) !== null)
        matches.push(match);
    return matches;
}
// SCRAPPER
// def get_no_school_events(year, term):
//     return [RegularEvent(**e) for e in scrap_no_school_events(year, term)]
function scrap_no_school_events(year, term) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, exception_1, soup, raw_events, scrapped_events, dtstart, dtend, description, _i, raw_events_1, raw_event, _a, _b, elem, class_, raw_description;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    url = "https://calendar.ucf.edu/" + year + "/" + term + "/no-classes/";
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1["default"].get(url)];
                case 2:
                    response = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    exception_1 = _c.sent();
                    throw new SchedulerError("Couldn't connect to calendar.ucf.edu to get no-school events. Either check your internet connection and try again or uncheck 'I am a UCF student' tickbox.");
                case 4:
                    soup = new jssoup_1["default"](response.data, false);
                    raw_events = soup.findAll("tr", { "class": "vevent" });
                    scrapped_events = [];
                    for (_i = 0, raw_events_1 = raw_events; _i < raw_events_1.length; _i++) {
                        raw_event = raw_events_1[_i];
                        dtstart = dtend = description = null;
                        for (_a = 0, _b = raw_event.findAll("abbr"); _a < _b.length; _a++) {
                            elem = _b[_a];
                            class_ = (elem['class'] instanceof String) ? elem['class'] : elem['class'][0];
                            if (class_ === "dtstart")
                                dtstart = elem['title'];
                            else if (class_ === "dtend")
                                dtend = elem['title'];
                        }
                        // Sometimes it has an event with no dtstart and no dtend.
                        // I would check back on it later(UCF Cal -> no - school tag -> Study day)
                        if (dtstart === null)
                            continue;
                        raw_description = raw_event.find("div", { "class": "more-details" });
                        if (raw_description !== null)
                            description = raw_description.getText().trim();
                        scrapped_events.push({
                            summary: raw_event.find("span", { "class": "summary" }).getText(),
                            start: new Date(dtstart),
                            end: new Date(dtend)
                        });
                        if (description)
                            scrapped_events[scrapped_events.length - 1]['description'] = description;
                    }
                    return [2 /*return*/, scrapped_events];
            }
        });
    });
}
