// Good luck figuring this out!
const reClassName = /[A-Z]{3}[A-Z]* \d+[A-Z]? - .+/g;
const reClassSection = /(?:(?<sectionType>[A-Z][a-z]+)\n)?(?<weekdays>(?:[A-Z][a-z])+)\s+(?<startTime>\d\d?:\d\d(?:AM|PM))\s+-\s+(?<endTime>\d\d?:\d\d(?:AM|PM))\n(?<location>.+)\n(?<professors>\D+)(?<dtstart>[\d/]+)\s+-\s+(?<dtend>[\d/]+)/g;

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

interface RRule {
    freq: string;
    byDay: string;
    until: Date;
    exclude?: Date[];
}

interface IcalEvent {
    summary: string;
    start: Date;
    end: Date;
    description: string;
    timezone: string;
}

interface ClassSectionEvent extends IcalEvent {
    location: string;
    rrule: RRule
}

function createClassSection(
    className: string, type: string, weekdays: string,
    startTime: string, endTime: string, location: string,
    professors: string, startDate: string, endDate: string): ClassSectionEvent {
    let byDay = weekdays.match(/../g).toString();
    let dtstart = makeDateTime(startDate, startTime);
    setTrueWeekday(dtstart, byDay);
    let dtend = makeDateTime(startDate, endTime);
    dtend.setUTCDate(dtstart.getUTCDate());
    let until = makeDateTime(endDate, endTime);
    until.setUTCHours(0, 0, 0, 0);
    return {
        summary: `${className} (${type})`,
        start: dtstart,
        end: dtend,
        location: location,
        description: "Professors: " + professors.replace(/\n/gm, ' '),
        timezone: TZ_NEW_YORK,
        rrule: {
            freq: "WEEKLY",
            byDay: byDay,
            until: until,
        }
    }
}

function makeDateTime(date: string, time: string) {
    let timeInfo = reClassTime.exec(time).groups;
    if (!timeInfo)
        throw new SchedulerError("TIMEINFO ERROR");
    let datetime = new Date(date);
    let hours = parseInt(timeInfo.hours)
    let noonIncrement: number = 0;
    if (timeInfo.isAfterNoon && hours < 12)
        noonIncrement = 12;
    else if (!timeInfo.isAfterNoon && hours == 12)
        noonIncrement = -12;
    datetime.setUTCHours(hours + noonIncrement);
    datetime.setUTCMinutes(parseInt(timeInfo.minutes));
    return datetime;
}

function setTrueWeekday(date: Date, byday: string) {
    byday = byday.toLowerCase()
    while (!byday.includes(date.toUTCString().slice(0, 2).toLowerCase()))
        date.setUTCDate(date.getUTCDate() + 1)
}


// MAIN
// @ts-ignore
window.convertToIcal = async function (schedule: string, isUCF: boolean) {
    schedule = schedule.trim();
    if (!schedule)
        throw new SchedulerError("You inputted an empty schedule.");
    let class_sections = parseSchedule(schedule);
    if (!class_sections)
        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.");
    let firstSectionStartDate = class_sections[0].start;
    let year = firstSectionStartDate.getUTCFullYear();
    let term = getSectionTerm(firstSectionStartDate);
    let no_school_events: IcalEvent[];
    if (isUCF)
        no_school_events = await scrap_no_school_events(year, term);
    else
        no_school_events = [];
    let exdates = make_timeless_exdates(no_school_events);
    for (let section of class_sections)
        add_exdates(section, exdates);
    return createIcalString(`Classes ${term} ${year}`, TZ_NEW_YORK, class_sections, no_school_events)
}

function getSectionTerm(sectionDate: Date): string {
    let start_month = sectionDate.getUTCMonth();
    if (7 <= start_month && start_month <= 9)
        return "Fall";
    else if (0 <= start_month && start_month <= 2)
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
                let newDate = new Date(noSchoolEvent.start);
                newDate.setUTCDate(newDate.getUTCDate() + i); // This might need to be converted to UTC
                dates.push(newDate);
            }
        else
            dates.push(noSchoolEvent.start);
    }
    console.log(dates.map((d) => {
        return d.toUTCString()
    }))
    return dates;
}

// If DTSTART is a date-time value then EXDATEs must also be date-times (c) RFC5545
function add_exdates(icalEvent: ClassSectionEvent, exdates: Date[]) {
    let hours = icalEvent.start.getUTCHours();
    let minutes = icalEvent.start.getUTCMinutes();
    let exdatesCopies = [];
    for (let exdate of exdates) {
        if (!icalEvent.rrule.byDay.toLowerCase().includes(exdate.toUTCString().slice(0, 2).toLowerCase()))
            continue;
        let newDate = new Date(exdate.getTime());
        newDate.setUTCHours(hours);
        newDate.setUTCMinutes(minutes);
        exdatesCopies.push(newDate);
    }
    icalEvent.rrule.exclude = exdatesCopies;
}
// PARSING

function parseSchedule(schedule: string): ClassSectionEvent[] {
    schedule = normalizeWhitespace(schedule);
    const classNames = schedule.match(reClassName)
    if (!classNames)
        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.")
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
        let lastSectionType: string = "";
        for (let section of sectionBatch) {
            let info: any = section.groups;
            if (sectionType = info.sectionType)
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
    let match: RegExpExecArray | null;
    while ((match = regex.exec(str)) !== null)
        matches.push(match);
    return matches;
}

// SCRAPPER

async function scrap_no_school_events(year: number, term: string): Promise<IcalEvent[]> {
    const url = `https://calendar.ucf.edu/${year}/${term}/no-classes/`;
    // typeof is necessary because of this: https://github.com/microsoft/TypeScript/issues/27311
    let response: Response, html: HTMLDocument;
    try {
        response = await fetch(url);
        let parser = new DOMParser();
        html = parser.parseFromString(await response.text(), 'text/html');
    }
    catch (exception) {
        throw new SchedulerError("Couldn't connect to calendar.ucf.edu to get no-school events. Either check your internet connection and try again or uncheck 'I am a UCF student' tickbox.");
    }
    let raw_events = html.querySelectorAll('tr.vevent')
    let scrapped_events = [];
    let start: Date, end: Date, dtstart: string, dtend: string, description: string, summary: string;
    for (let raw_event of raw_events) {
        start = end = dtstart = dtend = description = summary = null;
        for (let elem of raw_event.querySelectorAll("abbr")) {
            if (elem.className.includes("dtstart"))
                dtstart = elem.title;
            else if (elem.className.includes("dtend"))
                dtend = elem.title;
        }
        summary = raw_event.querySelector("span.summary").textContent
        // Sometimes it has an event with no dtstart and no dtend called "Study day"
        if (!dtstart || !summary)
            continue;
        start = new Date(dtstart);
        let raw_description = raw_event.querySelector("div.more-details");
        if (raw_description)
            description = raw_description.textContent.trim();
        if (!dtend) {
            end = new Date(start.getTime())
            end.setUTCDate(end.getUTCDate() + 1);
        }
        else
            end = new Date(dtend)
        scrapped_events.push({
            summary: summary,
            start: start,
            end: end,
            description: description ? description : "",
            timezone: TZ_NEW_YORK,
        });
    }
    return scrapped_events;
}

// Да пошли вы в жопу со своими JS-библиотеками. КТО-НИБУДЬ ВООБЩЕ МОЖЕТ РЕАЛИЗОВАТЬ ПОЛНЫЙ ФУНКЦИОНАЛ ICAL?
// Миллион библиотек, но ни одной рабочей. Сам реализую.

function createIcalString(name: string, tz: string, classSections: ClassSectionEvent[], noSchoolEvents: IcalEvent[]): string {
    let ical = `BEGIN:VCALENDAR\nSUMMARY:${name}\nTIMEZONE:${tz}\n`
    let ics = new ICS(tz);
    for (let e of classSections)
        ical += `
        BEGIN:VEVENT
        SUMMARY:${e.summary}
        DESCRIPTION:${e.description}
        LOCATION:${e.location}
        DTSTART;VALUE=DATE-TIME:${ics.toDatetime(e.start)}
        DTEND;VALUE=DATE-TIME:${ics.toDatetime(e.end)}
        RRULE:FREQ=WEEKLY;BYDAY=${e.rrule.byDay};INTERVAL=1;UNTIL=${ics.toDatetime(e.rrule.until)}
        EXDATE:${ics.toExdateList(e.rrule.exclude)}
        END:VEVENT
        `
    for (let e of noSchoolEvents)
        ical += `
        BEGIN:VEVENT
        SUMMARY:${e.summary}
        DESCRIPTION:${e.description}
        DTSTART;VALUE=DATE:${ics.toDate(e.start)}
        DTEND;VALUE=DATE:${ics.toDate(e.end)}
        END:VEVENT
        `
    ical += "\nEND:VCALENDAR"
    return ics.normalize(ical);

}

// All dates passed here must be in local timezone
// All moments passed here must be in UTC
class ICS {
    timezone: string

    constructor(timezone: string) {
        this.timezone = timezone;
    }

    toDatetime(dt: Date): string {
        // 20210411T090000
        return `${this.toDate(dt)}T${this.toTime(dt)}`;
    }

    toDate(dt: Date): string {
        return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate());
    }

    toTime(dt: Date): string {
        return pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + pad(dt.getUTCSeconds());
    }

    toExdateList(dates: Date[]): string {
        // EXDATE:20210118T090000Z,20210411T090000Z,20210412T090000Z
        return dates.map(this.toDatetime, this).join(",")
    }

    // This is necessary because RFC 5545 does not allow:
    //  trailing whitespace, blank lines, or lines longer than 75 chars
    normalize(ical: string): string {
        return foldLines(normalizeWhitespace(ical))
    }

}


function pad(n: number): string {
    if (n < 10)
        return '0' + n;
    else
        return '' + n
}

function foldLines(text: string) {
    return text.match(/[^\r\n]+/g)?.map(foldLine).join("\n");
}

function foldLine(line: string) {
    const parts = []
    let length = 75
    while (line.length > length) {
        parts.push(line.slice(0, length))
        line = line.slice(length)
        length = 74
    }
    parts.push(line)
    return parts.join('\n ')
}