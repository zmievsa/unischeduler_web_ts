import { match } from "assert";
import * as ical from "ical-generator"


// Good luck figuring this out!
const reClassName = /[A-Z]{3}[A-Z]* \d+[A-Z]? - .+/g;
const reClassSection = /(?:(?<sectionType>[A-Z][a-z]+)\n)?(?<weekdays>(?:[A-Z][a-z])+)\s+(?<startTime>\d\d?:\d\d(?:AM|PM))\s+-\s+(?<endTime>\d\d?:\d\d(?:AM|PM))\n(?<location>.+)\n(?<professors>\D+)(?<dtstart>[\d/]+)\s+-\s+(?<dtend>[\d/]+)/;

// Yes, they MUST be separate and CANNOT be combined
// Otherwise, js can sometimes remove necessary newlines
const reLeadingLineWhitespace = /(^\s+)/gm
const reEndingLineWhitespace = /(\s+$)/gm
const reNewlines = /\n+/gm

class SchedulerError extends Error {
    constructor(m: string) {
        super(m);

        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SchedulerError.prototype);
    }
}

class ClassSection {
    constructor() {
        extract_time_attributes(recurrence);
        // MoWeFr 9:30AM - 10:20AM
        /*
        def extract_time_attributes(time_line: str) -> Tuple[str, str, List[str]] {
            weekdays_str, start_time, _, end_time = time_line.split(" ")
            weekdays = [weekdays_str[i : i + 2] for i in range(0, len(weekdays_str), 2)]
            return start_time, end_time, weekdays
        }
        */
    }
}
function convertToIcal(schedule: string, isUCF: boolean) {
    schedule = schedule.trim();
    if (!schedule)
        throw new SchedulerError("You inputted an empty schedule.");
    let class_sections = parseSchedule(schedule); // returns List[ClassSection]
    if (!class_sections)
        throw new SchedulerError("Couldn't find any class sections in your schedule. Please, check your schedule or contact my author.");
    let year = class_sections[0].year
    let term = class_sections[0].term
    let no_school_events;
    if (isUCF)
        no_school_events = get_no_school_events(year, term);
    else
        no_school_events = [];
    exdates = make_timeless_exdates(no_school_events);
    cal = ical.Calendar(summary = f"Classes {term} {year}", timezone = TIMEZONE);
    for (section in class_sections)
        cal.add_component(create_event(section, exdates));
    for (event in no_school_events)
        cal.add_component(create_event(event));
    return cal.to_ical();
}

function parseSchedule(schedule: string): ClassSection[] {
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
            all_class_sections.push([
                classNames[i], lastSectionType, info.weekdays,
                info.startTime, info.endTime, info.location,
                info.professors, info.dtstart, info.dtend
            ]
            )
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
