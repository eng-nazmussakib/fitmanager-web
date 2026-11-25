import type { MockDb, OfferRow } from '../types';
import { addDaysIso, at } from './clock';

/** A post of seed 109, as data: `days` is its publication day relative to the seed day (null: a draft). */
interface SeedPost {
    slug: string;
    title: string;
    cat: string;
    excerpt: string;
    body: string;
    cover: string;
    alt: string;
    days: number | null;
    deleted: number | null;
}

const CATEGORIES: [string, string][] = [
    ['Strength Training', 'strength-training'],
    ['Nutrition', 'nutrition'],
    ['Cardio', 'cardio'],
    ['Home Workouts', 'home-workouts'],
    ['Motivation', 'motivation']
];

const POSTS: SeedPost[] = [
    {
        slug: '5-essential-exercises-for-building-muscle',
        title: '5 Essential Exercises For Building Muscle',
        cat: 'strength-training',
        excerpt: 'Squats, deadlifts, presses, rows and pull-ups: how to fit the big five into a week, and how heavy to go.',
        body: 'Five lifts cover almost every muscle you have. Learn them well and you need very little else.\n\n## The big five\n\n1. **Squat**: legs and core. Sit back and down, knees out, chest up.\n2. **Deadlift**: the whole back of the body. Keep the bar close and push the floor away.\n3. **Overhead press**: shoulders and arms. Squeeze your glutes so your back stays flat.\n4. **Row**: the upper back that keeps your posture tall.\n5. **Pull-up**: lats and grip. Use a band until you can do five clean ones.\n\n## A simple week\n\n- **Monday:** squat, press, row\n- **Wednesday:** deadlift, pull-up, a few lunges\n- **Friday:** squat, press, row again\n\n## How heavy?\n\nPick a weight you can lift *eight times* with two good reps left in the tank. When all your sets reach twelve, add a little weight.\n\n> Ask a coach on the floor to watch your first sessions. Good form now saves months later.\n',
        cover: 'assets/images/landing/blog-exercises.webp',
        alt: 'A barbell loaded for squats',
        days: -104,
        deleted: null
    },
    {
        slug: 'the-ultimate-guide-to-a-balanced-diet',
        title: 'The Ultimate Guide To A Balanced Diet',
        cat: 'nutrition',
        excerpt: 'Protein, carbs, fats and plates you can actually cook on a weeknight, without counting every calorie.',
        body: 'You do not need to weigh every grain of rice. A balanced plate gets you most of the way.\n\n## The plate\n\n- **Half:** vegetables and fruit, in as many colours as you can find at the bazar\n- **A quarter:** protein: fish, chicken, eggs, dal or chickpeas\n- **A quarter:** rice, roti or potatoes\n\n## Protein first\n\nAim for a palm-sized portion of protein at every meal. It keeps you full and helps your muscles recover after training.\n\n## Drink water\n\nTwo to three litres a day, more on hot days and training days. Tea counts; sugary drinks do not.\n\nSmall changes you keep beat big ones you drop after a week.\n',
        cover: 'assets/images/landing/blog-diet.webp',
        alt: 'A plate of rice, dal, vegetables and fish',
        days: -109,
        deleted: null
    },
    {
        slug: 'the-benefits-of-hiit-training',
        title: 'The Benefits Of HIIT Training',
        cat: 'cardio',
        excerpt: 'Short, hard intervals burn calories and build stamina. Here is how to start without burning out.',
        body: 'High-intensity interval training packs a lot of work into a short time.\n\n## Why it works\n\n- It raises your heart rate fast and keeps you burning energy after the session.\n- It builds stamina for sport and everyday life.\n- Twenty minutes is enough.\n\n## A first session\n\nWarm up for five minutes, then repeat **eight times**: 20 seconds hard on the bike, 40 seconds easy. Cool down for five minutes.\n\n## Go easy at first\n\nTwo HIIT sessions a week is plenty. Do them on days you are not lifting heavy, and stop if you feel dizzy.\n',
        cover: 'assets/images/landing/blog-hiit.webp',
        alt: 'A member sprinting on a bike',
        days: -116,
        deleted: null
    },
    {
        slug: 'home-workouts-for-busy-people',
        title: 'Home Workouts For Busy People',
        cat: 'home-workouts',
        excerpt: 'Twenty minutes, a mat and two dumbbells: three routines for the days you cannot reach the gym.',
        body: "Some weeks you cannot get to the gym. These keep you moving.\n\n## Routine A: legs\n\nThree rounds of 12 goblet squats, 10 lunges a side and 15 glute bridges.\n\n## Routine B: upper body\n\nThree rounds of 10 push-ups, 12 dumbbell rows a side and 10 shoulder presses.\n\n## Routine C: everything\n\nFive rounds of 30 seconds each: jumping jacks, mountain climbers, squats, plank. Rest a minute between rounds.\n\nWrite down what you did in the portal's **Routine** page, so your coach sees it too.\n",
        cover: 'assets/images/landing/blog-home.webp',
        alt: 'Dumbbells and a mat on a living-room floor',
        days: -123,
        deleted: null
    },
    {
        slug: 'how-to-always-stay-motivated',
        title: 'How To Always Stay Motivated',
        cat: 'motivation',
        excerpt: 'Motivation fades; habits stay. Small wins, training partners and tracking that keep you coming back.',
        body: "Nobody feels motivated every day. People who keep training rely on habits instead.\n\n## Make it a habit\n\n- Train at the **same times** each week, and put them in your calendar.\n- Pack your bag the night before.\n- Start small: two sessions a week you never miss beat five you skip.\n\n## Find a partner\n\nA friend waiting at the gym is the best alarm clock there is. Our group classes are a good place to meet one.\n\n## Track your wins\n\nYour streak and visits are on the portal's home page. Watching them grow is a reward in itself.\n",
        cover: 'assets/images/landing/blog-motivation.webp',
        alt: 'Two members high-fiving after a class',
        days: -130,
        deleted: null
    }
];

const PHOTOS = [
    {
        code: 'GUL',
        src: 'assets/images/gallery/gulshan-training-floor.webp',
        thumb: 'assets/images/gallery/gulshan-training-floor-sm.webp',
        alt: 'Bright training floor with machines and cardio by the windows',
        width: 640,
        height: 427,
        sort: 1
    },
    {
        code: 'DHA',
        src: 'assets/images/gallery/dhanmondi-cardio-row.webp',
        thumb: 'assets/images/gallery/dhanmondi-cardio-row-sm.webp',
        alt: 'A long row of treadmills on the cardio deck',
        width: 640,
        height: 480,
        sort: 1
    },
    {
        code: 'UTT',
        src: 'assets/images/gallery/uttara-dumbbell-wall.webp',
        thumb: 'assets/images/gallery/uttara-dumbbell-wall-sm.webp',
        alt: 'Dumbbells and medicine balls on racks by a brick wall',
        width: 427,
        height: 640,
        sort: 1
    },
    {
        code: 'GUL',
        src: 'assets/images/gallery/gulshan-strength-room.webp',
        thumb: 'assets/images/gallery/gulshan-strength-room-sm.webp',
        alt: 'Strength room in low light with mirrored machines',
        width: 427,
        height: 640,
        sort: 2
    },
    {
        code: 'DHA',
        src: 'assets/images/gallery/dhanmondi-boxing-ring.webp',
        thumb: 'assets/images/gallery/dhanmondi-boxing-ring-sm.webp',
        alt: 'Boxing ring and heavy bags in a high-ceilinged hall',
        width: 640,
        height: 427,
        sort: 2
    },
    {
        code: 'UTT',
        src: 'assets/images/gallery/uttara-window-cardio.webp',
        thumb: 'assets/images/gallery/uttara-window-cardio-sm.webp',
        alt: 'Treadmills facing a wall of windows with a hill view',
        width: 427,
        height: 640,
        sort: 2
    },
    {
        code: 'GUL',
        src: 'assets/images/gallery/gulshan-group-class.webp',
        thumb: 'assets/images/gallery/gulshan-group-class-sm.webp',
        alt: 'A coach leading a group class on exercise mats',
        width: 640,
        height: 427,
        sort: 3
    },
    {
        code: 'DHA',
        src: 'assets/images/gallery/dhanmondi-hex-lights.webp',
        thumb: 'assets/images/gallery/dhanmondi-hex-lights-sm.webp',
        alt: 'Hexagon ceiling lights over the free-weights area',
        width: 480,
        height: 640,
        sort: 3
    },
    {
        code: 'UTT',
        src: 'assets/images/gallery/uttara-treadmill-sprint.webp',
        thumb: 'assets/images/gallery/uttara-treadmill-sprint-sm.webp',
        alt: 'A member sprinting on a curved treadmill',
        width: 427,
        height: 640,
        sort: 3
    },
    {
        code: 'GUL',
        src: 'assets/images/gallery/gulshan-plate-rack.webp',
        thumb: 'assets/images/gallery/gulshan-plate-rack-sm.webp',
        alt: 'Colour-coded weight plates on a rack',
        width: 427,
        height: 640,
        sort: 4
    },
    {
        code: 'DHA',
        src: 'assets/images/gallery/dhanmondi-weight-stack.webp',
        thumb: 'assets/images/gallery/dhanmondi-weight-stack-sm.webp',
        alt: 'Close-up of a cable machine weight stack',
        width: 427,
        height: 640,
        sort: 4
    },
    {
        code: 'UTT',
        src: 'assets/images/gallery/uttara-cardio-session.webp',
        thumb: 'assets/images/gallery/uttara-cardio-session-sm.webp',
        alt: 'A member checking his pace on the treadmill',
        width: 640,
        height: 427,
        sort: 4
    }
];

// The draft, the scheduled post and the deleted one (seed 109's cases).
POSTS.push(
    {
        slug: 'stretching-after-every-session',
        title: 'Stretching After Every Session',
        cat: 'strength-training',
        excerpt: 'Five minutes of stretching after training: which stretches, how long to hold them, and why it helps.',
        body: 'A draft: HQ is still writing this one.\n\n- Hamstrings\n- Hip flexors\n- Chest and shoulders\n',
        cover: 'assets/images/landing/blog-exercises.webp',
        alt: 'A member stretching on a mat',
        days: null,
        deleted: null
    },
    {
        slug: 'ramadan-training-tips',
        title: 'Training Through Ramadan',
        cat: 'nutrition',
        excerpt: 'When to train, what to eat at iftar and sehri, and how to keep your strength through the month.',
        body: 'Scheduled: this post appears on its date.\n\n## When to train\n\nAn hour before iftar, or two hours after it.\n',
        cover: 'assets/images/landing/blog-diet.webp',
        alt: 'Dates and water on a table at iftar',
        days: 5,
        deleted: null
    },
    {
        slug: 'old-opening-hours-notice',
        title: 'Old Opening Hours Notice',
        cat: 'motivation',
        excerpt: 'The opening hours notice from last year, replaced by the branch pages.',
        body: 'Deleted.',
        cover: 'assets/images/landing/blog-motivation.webp',
        alt: '',
        days: -300,
        deleted: -200
    }
);

const DESCRIPTIONS: Record<string, string> = {
    GUL: 'Our first branch, on Road 11 in Gulshan 2: two floors with a bright training floor by the windows, a strength room, a studio for group classes, and showers and lockers on each floor. Ladies-only hours every morning.',
    DHA: 'Our Dhanmondi branch has the boxing ring, a long cardio deck and the largest free-weights area of the three. Close to Road 27, with parking in the evening.',
    UTT: 'Uttara’s newest gym, in Sector 7: treadmills facing a wall of windows, a dumbbell wall up to 50 kg and a quiet stretching corner. Easy to reach from the airport road.'
};

/**
 * Phase 7c (D-109), as seed 109: the website's content. Five categories; the five published posts, a draft, one
 * scheduled 5 days ahead and a deleted one; twelve photos (four per branch) and a removed one; offers running (three
 * with promo codes, one without), one ended and one not published; a description on each branch page.
 */
export function seedWebsite(db: MockDb, today: string): void {
    const hq = db.branches.find(b => b.kind === 'HQ')!.oid;
    const branch = (code: string): MockDb['branches'][number] => db.branches.find(b => b.code === code)!;
    const iso = (days: number): string => at(addDaysIso(today, days), 10 * 60);
    db.postCategories = CATEGORIES.map(([name, slug], i) => ({ oid: `cat-${slug}`, name, slug, sort_order: i + 1 }));
    db.posts = POSTS.map(p => ({
        oid: `post-${p.slug}`,
        branch_oid: hq,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
        category_oid: `cat-${p.cat}`,
        cover_file_oid: null,
        cover_url: p.cover,
        cover_alt: p.alt,
        author_name: 'Shirin Akhter',
        published_at: p.days === null ? null : iso(p.days),
        created_at: iso((p.days ?? 0) - 1),
        updated_at: iso((p.days ?? 0) - 1),
        deleted_at: p.deleted === null ? null : iso(p.deleted)
    }));
    db.gallery = [
        ...PHOTOS.map((g, i) => ({
            oid: `photo-${i + 1}`,
            branch_oid: branch(g.code).oid,
            file_oid: null,
            image_url: g.src,
            thumb_url: g.thumb,
            alt: g.alt,
            width: g.width,
            height: g.height,
            sort_order: g.sort,
            deleted_at: null
        })),
        {
            oid: 'photo-removed',
            branch_oid: branch('UTT').oid,
            file_oid: null,
            image_url: 'assets/images/gallery/uttara-cardio-session.webp',
            thumb_url: 'assets/images/gallery/uttara-cardio-session-sm.webp',
            alt: 'An older photo, removed',
            width: 640,
            height: 427,
            sort_order: 99,
            deleted_at: iso(-10)
        }
    ];
    const offer = (
        slug: string,
        title: string,
        summary: string,
        body: string,
        conditions: string[],
        code: string | null,
        from: number,
        to: number | null,
        sort: number,
        published = true
    ): OfferRow => ({
        oid: `offer-${slug}`,
        slug,
        title,
        summary,
        body,
        conditions,
        promo_code: code,
        starts_on: addDaysIso(today, from),
        ends_on: to === null ? null : addDaysIso(today, to),
        sort_order: sort,
        published,
        deleted_at: null
    });
    db.offers = [
        offer(
            'student-discount',
            'Student discount',
            '10% off any monthly or annual plan for full-time students.',
            'Studying and training? Show your student ID at the front desk and the discount comes off your plan.',
            ['Show a valid student ID', 'Ages 16 to 25'],
            'STUDENT10',
            -60,
            null,
            1
        ),
        offer(
            'refer-a-friend',
            'Refer a friend',
            '৳500 off for every friend who joins on a monthly or annual plan.',
            'Bring a friend along. When they join and give your member code, **you both** get ৳500 off.',
            ['The friend gives your member code when joining', 'No limit on referrals'],
            'REFER500',
            -60,
            null,
            2
        ),
        offer(
            'no-admission-fee',
            'No admission fee',
            'Join any branch this month and pay no admission fee.',
            '',
            ['New members only'],
            'NOADMISSION',
            -14,
            16,
            3
        ),
        offer(
            'company-teams',
            'Company teams',
            '10% off a Group plan for colleagues from the same company.',
            'Train with your team. Ask the branch manager for a quote for five or more colleagues.',
            ['Show your office ID cards', 'Same branch'],
            null,
            -90,
            null,
            4
        ),
        offer('eid-special', 'Eid special', 'Two weeks free on a new annual plan, over Eid.', '', ['Annual plans only'], null, -200, -170, 5),
        offer(
            'new-year-challenge',
            'New year challenge',
            'A six-week challenge with a free body check at the start and the end.',
            'Being written: published in December.',
            ['Members only'],
            null,
            30,
            null,
            6,
            false
        )
    ];
    for (const b of db.branches) if (DESCRIPTIONS[b.code]) b.description = DESCRIPTIONS[b.code];
}
