import * as ical from "ical-generator"
import axios, { AxiosResponse } from 'axios';
import JSSoup from 'jssoup';

// Good luck figuring this out!
const reClassName = /[A-Z]{3}[A-Z]* \d+[A-Z]? - .+/g;
const reClassSection = /(?:(?<sectionType>[A-Z][a-z]+)\n)?(?<weekdays>(?:[A-Z][a-z])+)\s+(?<startTime>\d\d?:\d\d(?:AM|PM))\s+-\s+(?<endTime>\d\d?:\d\d(?:AM|PM))\n(?<location>.+)\n(?<professors>\D+)(?<dtstart>[\d/]+)\s+-\s+(?<dtend>[\d/]+)/;

// Yes, they MUST be separate and CANNOT be combined
// Otherwise, js can sometimes remove necessary newlines
const reLeadingLineWhitespace = /(^\s+)/gm
const reEndingLineWhitespace = /(\s+$)/gm

const reNewlines = /\n+/gm

const reClassTime = /(?<hours>\d+)(?::)(?<minutes>\d+)(?<isAfterNoon>PM)?/;

const TZ_UTC = "UTC"
const TZ_NEW_YORK = "America/New_York"

const NUMBER_OF_MILLIS_IN_DAY = 86400000

class SchedulerError extends Error {
    constructor(m: string) {
        super(m);

        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SchedulerError.prototype);
    }
}

interface IcalEvent {
    summary: string;
    start: Date;
    end: Date;
    location?: string;
    description?: string;
    repeating?: ical.RepeatingData
}

function createClassSection(
    className: string, type: string, weekdays: string,
    startTime: string, endTime: string, location: string,
    professors: string, dtstart: string, dtend: string): IcalEvent {
    let byDay: any = weekdays.match(/../g); // type: day[]
    return {
        summary: `${className} ${type}`,
        start: makeDateTime(dtstart, startTime),
        end: makeDateTime(dtstart, endTime),
        location: location,
        description: "Professors: " + professors.replace(/\n/gm, ''),
        repeating: {
            freq: "WEEKLY",
            byDay: byDay,
            until: new Date(dtend)
        }
    }
}

function makeDateTime(date: string, time: string) {
    let timeInfo = reClassTime.exec(time).groups;
    let datetime = new Date(date);
    datetime.setHours(parseInt(timeInfo.hours) + (timeInfo.isAfterNoon ? 12 : 0));
    datetime.setMinutes(parseInt(timeInfo.minutes));
    return datetime;
}

// MAIN

async function convertToIcal(schedule: string, isUCF: boolean) {
    schedule = schedule.trim();
    if (!schedule)
        throw new SchedulerError("You inputted an empty schedule.");
    let class_sections = parseSchedule(schedule);
    if (!class_sections)
        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.");
    let firstSectionStartDate = class_sections[0].start;
    let year = firstSectionStartDate.getFullYear();
    let term = getSectionTerm(firstSectionStartDate);
    let no_school_events;
    if (isUCF)
        no_school_events = await scrap_no_school_events(year, term);
    else
        no_school_events = [];
    let exdates = make_timeless_exdates(no_school_events);
    for (let section of class_sections)
        add_exdates(section, exdates);
    return ical({ name: `Classes ${term} ${year}`, timezone: TZ_NEW_YORK }).toString();
}

function getSectionTerm(sectionDate: Date): string {
    let start_month = sectionDate.getMonth();
    if (7 <= start_month || start_month <= 9)
        return "Fall";
    else if (0 <= start_month || start_month <= 2)
        return "Spring";
    else
        return "Summer";
}


function make_timeless_exdates(no_school_events: IcalEvent[]): Date[] {
    let dates = [];
    for (let noSchoolEvent of no_school_events) {
        let day_count = (noSchoolEvent.end.getTime() - noSchoolEvent.start.getTime()) / NUMBER_OF_MILLIS_IN_DAY;
        if (day_count > 1)
            for (let i = 0; i < day_count + 1; i++) {
                let newDate = new Date(noSchoolEvent.start.valueOf());
                newDate.setDate(newDate.getDate() + i);
                dates.push(newDate);
            }
        else
            dates.push(noSchoolEvent.start);
    }
    return dates;
}

function add_exdates(icalEvent: IcalEvent, exdates: Date[]) {
    let hours = icalEvent.start.getHours();
    let minutes = icalEvent.start.getMinutes();
    let exdatesCopies = [];
    for (let exdate of exdates) {
        let newDate = new Date(exdate.getTime());
        newDate.setHours(hours);
        newDate.setMinutes(minutes);
        exdatesCopies.push(newDate);
    }
    icalEvent.repeating.exclude = exdatesCopies;
}
// PARSING

function parseSchedule(schedule: string): IcalEvent[] {
    schedule = normalizeWhitespace(schedule);
    const classNames = schedule.match(reClassName)// getAllRegexMatches(schedule, reSummary);
    const classSectionBatches = schedule.split(reClassName);
    classSectionBatches.shift() // classSectionBatches[0] == ''
    let all_class_sections = [];
    for (let i = 0; i < classNames.length; i++) {
        let rawSectionBatch = classSectionBatches[i];
        // TODO: What if we get an online class without datetimes? Is the regex enough to handle such cases?
        // TODO: What if the class info somehow contains dropped/withdrawn but in some other section? Ex: Prof name
        if (rawSectionBatch.includes("Dropped") || rawSectionBatch.includes("Withdrawn"))
            continue;
        let sectionBatch = getAllRegexMatches(rawSectionBatch, reClassSection)
        let sectionType: string;
        let lastSectionType: string;
        for (let section of sectionBatch) {
            let info = section.groups;
            if (sectionType = info?.sectionType)
                lastSectionType = sectionType;
            all_class_sections.push(createClassSection(
                classNames[i], lastSectionType, info.weekdays,
                info.startTime, info.endTime, info.location,
                info.professors, info.dtstart, info.dtend
            ))
        }
    }
    return all_class_sections
}

function normalizeWhitespace(str: string): string {
    return str.replace(reLeadingLineWhitespace, '').replace(reEndingLineWhitespace, '').replace(reNewlines, "\n");
}

function getAllRegexMatches(str: string, regex: RegExp): RegExpExecArray[] {
    let matches: RegExpExecArray[] = [];
    let match: RegExpExecArray;
    while ((match = regex.exec(str)) !== null)
        matches.push(match);
    return matches;
}

// SCRAPPER

async function scrap_no_school_events(year, term): Promise<IcalEvent[]> {
    const url = `https://calendar.ucf.edu/${year}/${term}/no-classes/`;
    let response: AxiosResponse<any>;
    try {
        response = await axios.get(url);
    } catch (exception) {
        throw new SchedulerError("Couldn't connect to calendar.ucf.edu to get no-school events. Either check your internet connection and try again or uncheck 'I am a UCF student' tickbox.");
    }
    let soup = new JSSoup(response.data, false)
    let raw_events = soup.findAll("tr", { "class": "vevent" })
    let scrapped_events = []
    let dtstart, dtend, description;
    for (let raw_event of raw_events) {
        dtstart = dtend = description = null;
        for (let elem of raw_event.findAll("abbr")) {
            let class_ = (elem['class'] instanceof String) ? elem['class'] : elem['class'][0];
            if (class_ === "dtstart")
                dtstart = elem['title'];
            else if (class_ === "dtend")
                dtend = elem['title'];
        }
        // Sometimes it has an event with no dtstart and no dtend.
        // I would check back on it later(UCF Cal -> no - school tag -> Study day)
        if (dtstart === null)
            continue;
        let raw_description = raw_event.find("div", { "class": "more-details" });
        if (raw_description !== null)
            description = raw_description.getText().trim();
        scrapped_events.push({
            summary: raw_event.find("span", { "class": "summary" }).getText(),
            start: new Date(dtstart),
            end: new Date(dtend),
        })
        if (description)
            scrapped_events[scrapped_events.length - 1]['description'] = description;
    }
    return scrapped_events
}