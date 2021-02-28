// Good luck figuring this out!
const reClassName = /[A-Z]{3}[A-Z]* \d+[A-Z]? - .+/g;
const reClassSection = /(?:(?<sectionType>[A-Z][a-z]+)\n)?(?<weekdays>(?:[A-Z][a-z])+)\s+(?<startTime>\d\d?:\d\d(?:AM|PM))\s+-\s+(?<endTime>\d\d?:\d\d(?:AM|PM))\n(?<location>.+)\n(?<professors>\D+)(?<dtstart>[\d/]+)\s+-\s+(?<dtend>[\d/]+)/g;
const reClassTime = /(?<hours>\d+)(?::)(?<minutes>\d+)(?<isAfterNoon>PM)?/;

// Yes, they MUST be separate and CANNOT be combined
// Otherwise, js can sometimes remove necessary newlines
const reLeadingLineWhitespace = /(^\s+)/gm
const reEndingLineWhitespace = /(\s+$)/gm


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
}

interface IcalEvent {
    summary: string;
    dtstart: Date;
    dtend: Date;
    description: string;
}

interface ClassSectionEvent extends IcalEvent {
    location: string;
    exclude: Date[];
    rrule: RRule;

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
        dtstart: dtstart,
        dtend: dtend,
        location: location,
        description: "Professors: " + professors.replace(/\n/gm, ' '),
        exclude: [],
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

// We assign it to window to be able to use it from html/js on the webpage.
// The reason we need it is because bundlers such as webpack don't leak any info about bundled packages.
// @ts-ignore
window.convertToIcal = async function (schedule: string, isUCF: boolean, timezone: string) {
    schedule = schedule.trim();
    if (!schedule)
        throw new SchedulerError("You inputted an empty schedule.");
    let class_sections = parseSchedule(schedule);
    if (!class_sections)
        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.");
    let firstSectionStartDate = class_sections[0].dtstart;
    let year = firstSectionStartDate.getUTCFullYear();
    let term = getSectionTerm(firstSectionStartDate);
    let no_school_events: IcalEvent[];
    if (isUCF)
        no_school_events = await getUCFNoSchoolEvents(year, term);
    else
        no_school_events = [];
    let exdates = make_timeless_exdates(no_school_events);
    for (let section of class_sections)
        add_exdates(section, exdates);
    return createIcalString(`Classes ${term} ${year}`, timezone, class_sections, no_school_events)
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
        let day_count = (noSchoolEvent.dtend.getTime() - noSchoolEvent.dtstart.getTime()) / NUMBER_OF_MILLIS_IN_DAY;
        if (day_count > 1)
            for (let i = 0; i < day_count + 1; i++) {
                let newDate = new Date(noSchoolEvent.dtstart);
                newDate.setUTCDate(newDate.getUTCDate() + i);
                dates.push(newDate);
            }
        else
            dates.push(noSchoolEvent.dtstart);
    }
    console.log(dates.map((d) => {
        return d.toUTCString()
    }))
    return dates;
}

// If DTSTART is a date-time value then EXDATEs must also be date-times (c) RFC5545
function add_exdates(icalEvent: ClassSectionEvent, exdates: Date[]) {
    let hours = icalEvent.dtstart.getUTCHours();
    let minutes = icalEvent.dtstart.getUTCMinutes();
    let exdatesCopies = [];
    for (let exdate of exdates) {
        if (!icalEvent.rrule.byDay.toLowerCase().includes(exdate.toUTCString().slice(0, 2).toLowerCase()))
            continue;
        let newDate = new Date(exdate.getTime());
        newDate.setUTCHours(hours);
        newDate.setUTCMinutes(minutes);
        exdatesCopies.push(newDate);
    }
    icalEvent.exclude = exdatesCopies;
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
    return str.replace(reLeadingLineWhitespace, '').replace(reEndingLineWhitespace, '').replace(/\n+/gm, "\n");
}

function getAllRegexMatches(str: string, regex: RegExp): RegExpExecArray[] {
    let matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(str)) !== null)
        matches.push(match);
    return matches;
}

async function getUCFNoSchoolEvents(year: number, term: string): Promise<IcalEvent[]> {
    let json;
    try {
        json = await (await fetch(`https://calendar.ucf.edu/json/${year}/${term}`)).json()
    }
    catch (exception) {
        throw new SchedulerError("Couldn't connect to calendar.ucf.edu to get no-school events. Either check your internet connection and try again or uncheck 'I am a UCF student' tickbox.");
    }
    let events = []
    for (let event of json.terms[0].events) {
        // Sometimes it has an event with no dtstart and no dtend called "Study day"
        // This check also protects us against events with no summaries
        if (event.tags && event.tags.includes("no-classes") && event.dtstart && event.summary) {
            let dtstart = new Date(event.dtstart);
            let dtend: Date;
            if (!event.dtend) {
                dtend = new Date(dtstart.getTime());
                dtend.setUTCDate(dtend.getUTCDate() + 1);
            }
            else
                dtend = new Date(event.dtend);
            let description: string = event.description || "";
            description = description.trim();
            events.push({
                summary: event.summary.trim(),
                dtstart: dtstart,
                dtend: dtend,
                description: description,
            });
        }
    }
    return events;
}

// Да пошли вы в жопу со своими JS-библиотеками. КТО-НИБУДЬ ВООБЩЕ МОЖЕТ РЕАЛИЗОВАТЬ ПОЛНЫЙ ФУНКЦИОНАЛ ICAL?
// Миллион библиотек, но ни одной рабочей. Сам реализую.
// P.s. https://xkcd.com/927/

function createIcalString(name: string, timezone: string, classSections: ClassSectionEvent[], noSchoolEvents: IcalEvent[]): string {
    let ics = new ICS(timezone);
    let tz = `;TZID=${timezone}`
    let creationDate = ics.toDatetime(new Date()) + "Z"
    let ical = `
    BEGIN:VCALENDAR
    SUMMARY:${name}
    PRODID:-//Ovsyanka83//UnischedulerTS MIMEDIR//EN
    VERSION:2.0
    DTSTAMP:${creationDate}
    CREATED:${creationDate}
    LAST-MODIFIED:${creationDate}
    `
    for (let e of classSections)
        ical += `
        BEGIN:VEVENT
        SUMMARY:${e.summary}
        DESCRIPTION:${e.description}
        LOCATION:${e.location}
        DTSTART;VALUE=DATE-TIME${tz}:${ics.toDatetime(e.dtstart)}
        DTEND;VALUE=DATE-TIME${tz}:${ics.toDatetime(e.dtend)}
        RRULE:FREQ=WEEKLY;BYDAY=${e.rrule.byDay};INTERVAL=1;UNTIL=${ics.toDatetime(e.rrule.until)}Z
        EXDATE:${ics.toExdateList(e.exclude)}
        END:VEVENT
        `
    for (let e of noSchoolEvents)
        ical += `
        BEGIN:VEVENT
        SUMMARY:${e.summary}
        DESCRIPTION:${e.description}
        DTSTART;VALUE=DATE${tz}:${ics.toDate(e.dtstart)}
        DTEND;VALUE=DATE${tz}:${ics.toDate(e.dtend)}
        END:VEVENT
        `
    ical += "\nEND:VCALENDAR"
    return ics.normalize(ical);
}

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
        // 20210411
        return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate());
    }

    toTime(dt: Date): string {
        // 093000
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
    return text.match(/[^\r\n]+/g)?.map(foldLine).join("\r\n");
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
    return parts.join('\r\n ')
}