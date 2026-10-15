- Goal is to make artsy visuals from my sporting history, all tracked with polar and wahoo, over the past ten years. The idea that got me started is the "weeks in your life" poster from Kurzgesagt. I want to make something similar but then with sporting weeks in 10 years, showing volume per week, sports done in one big overview, like a 10 x50 grid with popping colrs. The end goal is to make it so pretty my wife allows me to print it and hang it somewhere in the house. 
- My sporting carreer should show some interesting patterns. Starting in 2015, I became a student athlete in rowing. Something like varsity squads in the USA. It's quite a scene in the Netherlands with cool but weird culture to go along (link to something). After rowing form 3 years I started cycling competitively. With the start of working and recently becoming a dad, we can really get a cool perspective of my sporting past and how it has changed over the years. Sporting is important to me. 
- Big inspiration is Nadie Bremer and https://www.data-to-art.com/
- The plan is to download all the data, store them on Hetzner object storage, use a VPS with remote development to do the analysis - extract metadata and useful information an write them to reusable formats before we even start visuallysing. 
- Started of by trying to get all data from intervals.icu, which I really like and have used for a really long time. All my data is there anyways. But due to the strava service agreement, downstream applications cannot share the data. Since the app is so great and we can get all sorts of data from there - the api docs are really extensive too -  we will just keep the client for later.
- Btw, I do this the centaur (backlink) way of developing. I scaffold the folder, choose the platforms and dependencies and the code practices but also let the agent (codex atm, claude code is cool too) in on the work. For instance, I just download the whole open API spec into the repo so that it can easier infer the right schemas and endpoints when I'd like it to.
- So, later I found that strava has this download archive feature and that some cool bloke on the internet (we've got plenty!) actually open sourced a really nice [side project](https://github.com/liskin/strava-offline) of his, that allows us to extract the metadata and some activity data into a database. It's two years old, but the code might give us a nice starting point or some pointers. There was a [MLE](https://www.reddit.com/r/dataengineering/comments/vjkarw/elt_of_my_own_strava_data_using_the_strava_api/) that built a [data pipeline](https://github.com/jackmleitch/StravaDataPipline) too, but that's 4 years ago and no longer applicable unfortunatly. 
- GDPR to the rescue! Happy to be a European citizen. Strava does still not make this easy, as you have to go into settings > acount > delete your account flow in orde to find the request archive as the second step in the exit flow. Knowing that the heavily throttled API they offer (insert limits), the only real option is to request the whole dataset through this feature and (if wanted) incrementally extend the dataset with thier API. The data you obtain is very comprehensive, though. All media, comments, reactions, clubs, etc, is included. Even a nice overview activities.csv is supplied with a lot of metadata of the activities. Overview stats like duration, activity type, kilometers covered. But also quite in depth data like max hr, average speed, relative effort, cadence, power, weather data, training load, etc. A total of 101 data entries is supplied for each activity. Of course, not all are filled but this gives us a nice starting point.
- Off course we will do a little EDA first and clean up the data a bit. So from strava_initial_analysis.py we get a couple of insights:
  - Strava data is only from may 2017 onwards, we need to get this data from polar it seems
  - Covers little to none of my rowing carreer
  - Before merging the data is a bit over the place with some weird logs
  - Ride is more dominant than I anticipated, both in volume and counts
- Luckily, we can also get the data from Polar through the GDPR fucntionality. They make it a lot easier, just a big download button on the accounts page. Downside, their data is exported as json, without the sweet overview of activities that Strava prepared for us. So we'll have to make a small loader script that generates the relevant field from Polar too. The part that might get a bit tricky is trying to prevent duplicates.
- Now we have two exports: 903 Polar activities and 1,653 Strava activities after the earlier Strava cleanup. Adding those together would give us 2,556 records, but probably quite a few workouts twice. I expected this to become a fiddly exercise in matching individual sessions. Luckily, plotting the overlap made a much simpler approach look reasonable.

  **Figure: [Activity coverage — Polar and Strava](plots/polar-strava-activity-overlap.json).** The monthly activity counts give us the first clue. Polar supplies the early history; Strava starts in May 2017 and eventually becomes the main source. But two areas overlapping on a chart do not tell us whether they contain the same sessions.

- Next, look at individual activities: date on the horizontal axis, duration on the vertical axis, separate panels for sports, and a year selector. Polar is a circle, Strava a cross. Where they sit on top of each other, we have a promising candidate for a duplicate.

  **Figure: [Activities by sport and year](plots/polar-strava-activity-comparison.json).** Rowing and running overlap heavily, while cycling becomes almost entirely Strava-only after 2018. There is also a naming problem: Polar's `OTHER_INDOOR` often corresponds to weight training in Strava. We map that to weight training, align the other sport names, and group indoor and outdoor rowing/cycling for this comparison. Strava timestamps are converted from UTC to Netherlands local time to line up with Polar's local timestamps. This improves the comparison, although some timezone quirks remain.

- The more useful overview is a monthly timeline built from **daily counts per sport**. Comparing just daily totals would let a ride in one export cancel out a run in the other. Comparing monthly totals directly would let sessions on completely different days cancel out. So, for each day and sport, take the smaller count as a provisional match and keep the remainder as that source's surplus. Only then add those counts up by month. For example, three Strava rides and one Polar ride on a day become one provisional match and two Strava surplus activities.

  **Main figure: [Shared training history — May 2017–June 2023](plots/polar-strava-monthly-reconciliation.json).** The grey bar floats around the centre and shows the matched count. Coloured segments extending left are Strava's surplus; segments extending right are Polar's. Colours identify the sports, numbers at the outside show each side's total surplus, and the year headings let us follow the handover down the timeline. A grey segment counts a shared activity once, rather than adding both source records together.

  This is the figure to spend some time with. The early Polar surplus includes rowing we want to preserve. Later, the large Strava extension is overwhelmingly cycling. My hunch was that cycling explained all of the difference. Close, but not quite:

  | Sport | Polar count | Strava count | Matched by day + sport | Strava surplus | Polar surplus |
  |---|---:|---:|---:|---:|---:|
  | Cycling | 98 | 959 | 93 | 866 | 5 |
  | Rowing | 211 | 184 | 180 | 4 | 31 |
  | Running | 121 | 123 | 118 | 5 | 3 |
  | Swimming | 17 | 31 | 17 | 14 | 0 |
  | Weight training | 114 | 126 | 110 | 16 | 4 |
  | Hiking | 4 | 0 | 0 | 0 | 4 |
  | Other | 8 | 0 | 0 | 0 | 8 |
  | **Total** | **573** | **1,423** | **518** | **905** | **55** |

  These totals cover May 2017 through June 2023, inclusive. Cycling explains about 96% of Strava's surplus, with another 39 activities spread across weight training, swimming, running and rowing. The smaller right-hand extensions matter too: Polar still has activities that the daily count comparison does not account for in Strava.

- Is counting sessions too coarse? It is not proof of individual duplicates, but a check of equal-count day/sport groups was reassuring. Pairing sessions in chronological order gave 511 pairs: 494 started within one minute of each other. Another 15 differed by almost exactly one or two hours, suggesting remaining timezone issues; two had less obvious offsets of about 19 and 22 minutes.

  Duration is not a perfect tie-breaker either. One ride has 108 minutes of duration in Polar, but 216 minutes between its start and stop. Strava reports about 216 minutes elapsed. A large difference can therefore reflect different treatment of pauses, even for what appears to be the same session. For this project, the timeline and these checks give me enough confidence to use a simple source handover rather than build a perfect duplicate matcher.

- The final consolidation follows this rule. The rowing exception covers both indoor and outdoor rowing:

  | Period | Rowing | All other sports |
  |---|---|---|
  | Before May 2017 | Polar | Polar |
  | May–June 2017 | Polar | Strava |
  | July 2017 onward | Strava | Strava |

  During May and June, Polar rowing replaces Strava rowing; we do not keep both. The daily count analysis helped justify this rule, but the actual merge selects these source slices directly. Funny how little complicated logic we need once the monthly timeline makes the transition visible.

  **Figure: [Consolidated activity coverage](plots/polar-strava-consolidated-coverage.json).** This time the areas stack: only retained Polar and Strava records contribute, so the top edge is the final monthly total. We end up with **2,012 activities: 362 from Polar and 1,650 from Strava**. The small period where both colours contribute is the handover, not double counting.

- This is deliberately an approximation. We leave out 544 source records, mostly apparent duplicates. Of Polar's 55 surplus counts in the overlap table, the rowing exception preserves 29; the remaining **26 potentially additional activities** are left out: eight Other, five cycling, four hiking, four weight training, three running and two rowing. That is about 1.3% of the retained activity count. They are unmatched counts, not 26 proven unique workouts. For an overview of ten years of sporting life, I am happy with that trade-off: preserve the early history, allow a short handover, then trust Strava. The original exports remain available if we want to revisit those edge cases later.
