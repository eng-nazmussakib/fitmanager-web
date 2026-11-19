import type { HoursBlock, TenantConfig } from './tenant.model';

/**
 * THE brand config: one file for the whole app's look and the public landing page.
 * Brand name and logo, colour themes (the admin consoles, sign-in and the landing page share them), and every
 * text, image, link and section of the landing page. Shape and comments: `tenant.model.ts`.
 *
 * One brand, one build (D-001, D-018). Import it as `@config/tenant`. A second brand would be a
 * `fileReplacements` entry in angular.json that swaps this file, so its config never reaches this bundle.
 */

/** Every branch keeps these hours today. Give a branch its own array when its hours differ. */
const STANDARD_HOURS: HoursBlock[] = [
    {
        title: 'Opening Hours',
        sessions: [
            { days: 'satThu', ranges: [['07:00', '23:00']] },
            { days: 'friday', ranges: [['16:00', '21:00']] }
        ]
    },
    { title: 'Ladies Hour', sessions: [{ days: 'satThu', ranges: [['12:00', '15:00']] }] },
    {
        title: 'Combined Hour',
        sessions: [
            {
                days: 'satThu',
                ranges: [
                    ['07:00', '12:00'],
                    ['15:00', '23:00']
                ]
            },
            { days: 'friday', ranges: [['16:00', '21:00']] }
        ]
    }
];

const IMG = 'assets/images/landing';
const GALLERY = 'assets/images/gallery';

export const TENANT: TenantConfig = {
    id: 'default',
    // The gym's brand: name, tagline and logo. The wordmark shows "Iron Tribe" plain and "Fitness" in the theme colour;
    // the logo block and the browser icon show a dumbbell (`mark`; 'initials' shows "ITF").
    brand: {
        name: 'Iron Tribe Fitness',
        wordmark: ['Iron Tribe ', 'Fitness'],
        mark: 'dumbbell',
        tagline: 'Transform Your Body'
        // logo: 'assets/images/tenants/default.svg', // an image instead of the wordmark
    },

    // Accents keep white text at 4.5:1 or more and stand out on their dark surfaces.
    poweredBy: { name: 'FitManager' },

    themes: [
        {
            id: 'ember',
            label: 'Ember',
            primary: '#d90a14',
            secondary: '#cd4e17',
            primaryShades: ['#fbe7e8', '#f3b3b6', '#ee8e93', '#e65b62', '#e13b43', '#d90a14', '#c50912', '#9a070e', '#77060b', '#5b0408'],
            secondaryShades: ['#faede8', '#f0c8b7', '#e8ae94', '#de8864', '#d77145', '#cd4e17', '#bb4715', '#923710', '#712b0d', '#56210a'],
            primaryStates: { hover: '#c30912', pressed: '#ae0810' },
            secondaryStates: { hover: '#b94615', pressed: '#a43e12' },
            surfaces: ['#181818', '#1b1b1b', '#232323', '#2a2a2a']
        },
        { id: 'ocean', label: 'Ocean', primary: '#2f6fe8', secondary: '#0a84a8', surfaces: ['#10141b', '#141922', '#1b212c', '#232a37'], tintPhotos: true },
        { id: 'forest', label: 'Forest', primary: '#16883f', secondary: '#b06a0a', surfaces: ['#111612', '#141a16', '#1b231d', '#232c25'], tintPhotos: true },
        { id: 'royal', label: 'Royal', primary: '#8b45f0', secondary: '#d02a75', surfaces: ['#13111a', '#18151f', '#1f1b28', '#282332'], tintPhotos: true },
        { id: 'copper', label: 'Copper', primary: '#c2570c', secondary: '#0e7f75', surfaces: ['#161311', '#1a1715', '#221e1b', '#2b2622'], tintPhotos: true }
    ],
    defaultTheme: 'ember',

    features: { themeSwitcher: true },

    auth: {
        image: { src: `${IMG}/hero-athlete.webp`, alt: 'An athlete holding a dumbbell', tint: `${IMG}/hero-athlete.tint.webp` },
        title: 'Train Hard,',
        accent: 'Live Strong',
        text: 'One account for your membership: plans, payments, visits and your trainer, at every branch.',
        points: ['Expert coaches at every branch', 'Ladies hour with women trainers', 'Track your visits and renewals']
    },
    landing: {
        // Fallback only (D-040): the database's site_group switches decide, set by HQ at /hq/settings.
        sections: ['hero', 'stats', 'services', 'plans', 'facilities', 'reviews', 'trainers', 'blog', 'branches', 'gallery'],
        seo: {
            title: 'Gym & fitness in Dhaka',
            description:
                'Achieve your fitness goals with expert coaches, personalised workout and nutrition plans, and simple monthly or annual memberships. Join the community today.'
        },
        currency: { symbol: '৳', code: 'BDT' },
        // Header menu: each shown section with a label, in `sections` order. More than `max` → the rest go under `more`.
        nav: {
            labels: {
                hero: 'Home',
                services: 'Programs',
                plans: 'Membership',
                facilities: 'Facilities',
                reviews: 'Reviews',
                trainers: 'Trainers',
                blog: 'Blog',
                branches: 'Branches',
                gallery: 'Gallery',
                faq: 'FAQ'
            },
            more: 'More',
            max: 5
        },
        signUp: { label: 'Sign Up', route: '/auth/sign-up' },

        hero: {
            lines: ['Achieve Your', 'Fitness Goals', 'With {brand}'],
            text: 'Join the {brand} community and transform your fitness journey. Our expert coaches and personalised programs are designed to help you achieve your goals and exceed your expectations. Ready to make a change?',
            primaryCta: { label: 'Start Your Journey', route: '/auth/sign-up' },
            secondaryCta: { label: 'Explore Programs', fragment: 'services' },
            image: {
                src: `${IMG}/hero-athlete.webp`,
                alt: 'A smiling athlete in a white T-shirt holding a weight plate',
                tint: `${IMG}/hero-athlete.tint.webp`
            },
            badges: [
                { value: '1,200+', label: 'Success Stories', icon: 'trophy', left: 0.5, top: 28.7, width: 22 },
                { value: '3,000+', label: 'Happy Clients', icon: 'smile', left: 72, top: 11.2, width: 26.4 },
                { value: '850+', label: 'Perfect Bodies', icon: 'flame', left: 4.3, top: 82.1, width: 25.6 },
                { value: '25+', label: 'Expert Coaches', icon: 'dumbbell', left: 76.7, top: 79.3, width: 22 }
            ]
        },

        promo: {
            id: 'no-admission-2026',
            badge: 'Limited offer',
            title: 'No Admission',
            accent: 'Fee',
            text: 'Join any {brand} branch this month and pay no admission fee. Pick Single, Duo or Group and start training today.',
            note: 'New members only · Until 31 Dec 2026',
            image: { src: `${IMG}/service-muscle.webp`, alt: 'A member training with dumbbells', tint: `${IMG}/service-muscle.tint.webp` },
            cta: { label: 'Claim Offer', route: '/auth/sign-up' },
            secondary: { label: 'See all offers', route: '/offers' },
            delaySeconds: 2.5,
            snoozeDays: 3
        },
        stats: [
            { value: '96%', label: 'Client Satisfaction', text: 'Our members love their results and experience', tone: 'primary' },
            { value: '+5', label: 'Years Of Experience', text: 'Trust our proven track record of transforming', tone: 'secondary' },
            { value: '+800', label: 'Active Members', text: 'Join our thriving fitness community', tone: 'primary' },
            { value: '24/7', label: 'Support Available', text: 'Expert assistance whenever you need it', tone: 'secondary' }
        ],

        services: {
            title: 'Our',
            accent: 'Services',
            lead: 'At this part you can easily access all of our services. Take a look at them and choose whichever you want.',
            items: [
                {
                    title: 'Losing Weight',
                    lead: 'Join our weight loss plans',
                    text: 'Achieve sustainable weight loss with customised programs that help you burn fat and build a healthier, leaner body.',
                    image: { src: `${IMG}/service-weight-loss.webp`, alt: 'A man training on an air bike', tint: `${IMG}/service-weight-loss.tint.webp` },
                    link: { label: 'Learn More', fragment: 'branches' }
                },
                {
                    title: 'Building Muscle',
                    lead: 'Join our muscle building plans',
                    text: 'Develop strength and define your muscles with tailored programs that help you gain lean mass efficiently.',
                    image: { src: `${IMG}/service-muscle.webp`, alt: 'A man in a white tank top lifting a dumbbell', tint: `${IMG}/service-muscle.tint.webp` },
                    link: { label: 'Learn More', fragment: 'branches' }
                },
                {
                    title: 'Training At Home',
                    lead: 'See our ultimate home plans',
                    text: 'Stay fit and strong with effective home workouts that need minimal equipment. Pick from many plans.',
                    image: { src: `${IMG}/service-home.webp`, alt: 'A man training with a resistance band', tint: `${IMG}/service-home.tint.webp` },
                    link: { label: 'Learn More', fragment: 'branches' }
                },
                {
                    title: 'Gym Plan',
                    lead: 'Enter your details, get your plan',
                    text: 'Make the most of every gym session with structured plans that guide you towards your fitness goals.',
                    image: { src: `${IMG}/service-gym-plan.webp`, alt: 'An athlete in a tank top seen from behind', tint: `${IMG}/service-gym-plan.tint.webp` },
                    link: { label: 'Learn More', fragment: 'branches' }
                }
            ]
        },

        plans: {
            title: 'Our',
            accent: 'Plans',
            lead: 'Select the plan that suits your fitness goals and let our expert coaches guide you every step of the way.',
            periods: [
                { id: 'monthly', label: 'Monthly', months: 1 },
                { id: 'quarterly', label: '3 Months', months: 3 },
                { id: 'half-yearly', label: '6 Months', months: 6 },
                { id: 'annual', label: 'Annually', months: 12 }
            ],
            // Opens sign-up with the plan and the selected period filled in.
            cta: { label: 'Choose This Plan', route: '/auth/sign-up' },
            kicker: 'Package',
            // 'auto': a card per plan with a period switch. Without tiers (no `items`, only `membership`), a card per period:
            //   membership: { name: 'Membership', features: […], prices: { monthly: 3000, quarterly: 8500, … } },
            // Tiers can be anything, e.g. { id: 'duo', name: '2 Persons', kicker: 'Membership', prices: { monthly: 8000, … } }.
            layout: 'auto',
            items: [
                {
                    id: 'single',
                    name: 'Single',
                    kicker: '1 Person',
                    description: 'Your own membership. Train at your pace with full access to the gym floor and our coaches.',
                    features: [
                        'Full gym floor access',
                        'Locker and shower',
                        'Personalised workout plan',
                        'Progress tracking',
                        'Monthly check-in with a trainer',
                        'Group fitness classes'
                    ],
                    prices: { monthly: 3000, quarterly: 8500, 'half-yearly': 16500, annual: 30000 }
                },
                {
                    id: 'duo',
                    name: 'Duo',
                    kicker: '2 Persons',
                    description: 'Train with a partner, friend or family member and save. One membership for two people at the same branch.',
                    features: [
                        'Everything in Single, for both of you',
                        'Partner workout plans',
                        'Shared progress tracking',
                        'Fortnightly check-ins with a trainer',
                        'Priority booking for group classes',
                        'One guest pass a month'
                    ],
                    prices: { monthly: 5500, quarterly: 15500, 'half-yearly': 30000, annual: 55000 },
                    featured: true
                },
                {
                    id: 'group',
                    name: 'Group',
                    kicker: 'Up to 4 Persons',
                    description: 'For families, friends or teams of three or four. The best price per person, with a trainer for the group.',
                    features: [
                        'Everything in Single, for each member',
                        'Group workout plans',
                        'Weekly group session with a trainer',
                        'Priority booking for group classes',
                        'Two guest passes a month',
                        'Discounts on gear'
                    ],
                    prices: { monthly: 10000, quarterly: 28500, 'half-yearly': 55000, annual: 100000 }
                }
            ]
        },

        facilities: {
            title: 'Our',
            accent: 'Facilities',
            lead: 'Everything you need to train well, under one roof at every branch.',
            items: [
                { name: 'Strength Zone', text: 'Free weights, racks and plate-loaded machines.', icon: 'dumbbell' },
                { name: 'Cardio Zone', text: 'Treadmills, bikes, rowers and cross-trainers.', icon: 'heartPulse' },
                { name: 'Group Studio', text: 'Daily classes, from HIIT to mobility.', icon: 'users' },
                { name: 'Ladies Hour', text: 'Ladies-only training hours, Saturday to Thursday.', icon: 'venus' },
                { name: 'Lockers & Showers', text: 'Secure lockers and clean, hot showers.', icon: 'showerHead' },
                { name: 'Parking', text: 'Parking for members while they train.', icon: 'parking' }
            ]
        },

        reviews: {
            title: 'What Our',
            accent: 'Customers Say',
            lead: 'At this part you can see a few of the many positive reviews from our customers.',
            items: [
                {
                    name: 'Steven Haward',
                    role: 'Custom plan member',
                    quote: 'I have been training here for three months and I am genuinely impressed. Everything is clearly laid out, and the personalised coaching has been a game-changer for me. My coach is incredibly supportive and always available to answer my questions. The weekly sessions keep me motivated, and the meal plans have helped me stay on track. Highly recommended for anyone serious about their fitness journey!',
                    image: { src: `${IMG}/review-steven.webp`, alt: 'Portrait of Steven Haward' }
                },
                {
                    name: 'Josh Oliver',
                    role: 'Duo member',
                    quote: 'The workout plans are tough but fair, and my trainer adjusts them every week. I have put on real strength in two months and finally enjoy coming to the gym.',
                    image: { src: `${IMG}/review-josh.webp`, alt: 'Portrait of Josh Oliver', tint: `${IMG}/review-josh.tint.webp` }
                },
                {
                    name: 'Edward Hawley',
                    role: 'Single member',
                    quote: 'I had never set foot in a gym before. The Single plan and a monthly check-in made it simple to get started and the community made me feel welcome from day one.',
                    image: { src: `${IMG}/review-edward.webp`, alt: 'Portrait of Edward Hawley', tint: `${IMG}/review-edward.tint.webp` }
                }
            ]
        },

        trainers: {
            title: 'Meet Our',
            accent: 'Trainers',
            lead: 'At this part you can see some of our trainers and their work.',
            viewAll: { label: 'View All', route: '/trainers' },
            page: {
                title: 'Our',
                accent: 'Trainers',
                lead: 'Certified coaches on the floor at every branch. Find the one who fits your goals and book a session at the front desk.',
                seo: {
                    title: 'Personal trainers',
                    description: 'Meet the certified personal trainers at every {brand} branch: strength, fat loss, mobility and more.'
                }
            },
            // Placeholder profiles: replace with the client's trainers.
            items: [
                {
                    name: 'Sam Cole',
                    role: 'Personal Trainer',
                    branch: 'Gulshan',
                    specialties: ['Strength', 'Powerlifting', 'Form coaching'],
                    bio: 'Ten years under the bar. Sam builds strength programs around compound lifts and clean technique.',
                    image: { src: `${IMG}/trainer-sam.webp`, alt: 'Portrait of Sam Cole', tint: `${IMG}/trainer-sam.tint.webp` },
                    link: { label: 'Learn More', route: '/trainers' }
                },
                {
                    name: 'Michael Harris',
                    role: 'Personal Trainer',
                    branch: 'Dhanmondi',
                    specialties: ['Hypertrophy', 'Body recomposition'],
                    bio: 'Michael pairs muscle-building blocks with simple nutrition habits that last beyond the program.',
                    image: { src: `${IMG}/trainer-michael.webp`, alt: 'Portrait of Michael Harris', tint: `${IMG}/trainer-michael.tint.webp` },
                    link: { label: 'Learn More', route: '/trainers' }
                },
                {
                    name: 'John Anderson',
                    role: 'Personal Trainer',
                    branch: 'Uttara',
                    specialties: ['Fat loss', 'Conditioning', 'HIIT'],
                    bio: 'John runs the conditioning classes at Uttara and keeps every session hard, short and fun.',
                    image: { src: `${IMG}/trainer-john.webp`, alt: 'Portrait of John Anderson', tint: `${IMG}/trainer-john.tint.webp` },
                    link: { label: 'Learn More', route: '/trainers' }
                },
                {
                    name: 'Tom Blake',
                    role: 'Personal Trainer',
                    branch: 'Gulshan',
                    specialties: ['Beginners', 'Mobility', 'Athletic performance'],
                    bio: 'Tom helps first-timers find their feet and athletes move better, with mobility work in every plan.',
                    image: { src: `${IMG}/trainer-tom.webp`, alt: 'Portrait of Tom Blake', tint: `${IMG}/trainer-tom.tint.webp` },
                    link: { label: 'Learn More', route: '/trainers' }
                }
            ]
        },

        blog: {
            title: '{brand}',
            accent: 'Blog Posts',
            lead: 'Discover essential tips to maximise your workout results and reach your fitness goals faster.',
            viewAll: { label: 'View All', route: '/blog' },
            page: {
                title: '{brand}',
                accent: 'Blog',
                lead: 'Training tips, nutrition guides and motivation from our coaches. Pick a category to narrow it down.',
                seo: { title: 'Blog', description: 'Training tips, nutrition guides and motivation from the {brand} coaches.' }
            },
            items: [
                {
                    title: '5 Essential Exercises For Building Muscle',
                    category: 'Strength Training',
                    date: 'August 14',
                    excerpt: 'Squats, deadlifts, presses, rows and pull-ups: how to fit the big five into a week, and how heavy to go.',
                    image: { src: `${IMG}/blog-exercises.webp`, alt: '' },
                    link: { label: 'Learn More', route: '/blog' }
                },
                {
                    title: 'The Ultimate Guide To A Balanced Diet',
                    category: 'Nutrition',
                    date: 'August 9',
                    excerpt: 'Protein, carbs, fats and plates you can actually cook on a weeknight, without counting every calorie.',
                    image: { src: `${IMG}/blog-diet.webp`, alt: '' },
                    link: { label: 'Learn More', route: '/blog' }
                },
                {
                    title: 'The Benefits Of HIIT Training',
                    category: 'Cardio',
                    date: 'August 2',
                    excerpt: 'Short, hard intervals burn calories and build stamina. Here is how to start without burning out.',
                    image: { src: `${IMG}/blog-hiit.webp`, alt: '' },
                    link: { label: 'Learn More', route: '/blog' }
                },
                {
                    title: 'Home Workouts For Busy People',
                    category: 'Home Workouts',
                    date: 'July 27',
                    excerpt: 'Twenty minutes, a mat and two dumbbells: three routines for the days you cannot reach the gym.',
                    image: { src: `${IMG}/blog-home.webp`, alt: '' },
                    link: { label: 'Learn More', route: '/blog' }
                },
                {
                    title: 'How To Always Stay Motivated',
                    category: 'Motivation',
                    date: 'July 20',
                    excerpt: 'Motivation fades; habits stay. Small wins, training partners and tracking that keep you coming back.',
                    image: { src: `${IMG}/blog-motivation.webp`, alt: '' },
                    link: { label: 'Learn More', route: '/blog' }
                }
            ]
        },

        branches: {
            many: {
                title: 'Our',
                accent: 'Branches',
                lead: 'Join online or at the branch closest to you. Here are the opening, ladies-only and combined hours for each one.'
            },
            single: { title: 'Opening', accent: 'Hours', lead: 'Visit us to join. Here are our opening, ladies-only and combined hours.' },
            // Placeholder addresses: replace with the client's.
            items: [
                { name: 'Gulshan', address: 'Road 11, Gulshan 2, Dhaka', locality: 'Dhaka', country: 'BD', hours: STANDARD_HOURS },
                { name: 'Dhanmondi', address: 'Road 27, Dhanmondi, Dhaka', locality: 'Dhaka', country: 'BD', hours: STANDARD_HOURS },
                { name: 'Uttara', address: 'Sector 7, Uttara, Dhaka', locality: 'Dhaka', country: 'BD', hours: STANDARD_HOURS }
            ]
        },

        gallery: {
            title: 'Our',
            accent: 'Gallery',
            lead: 'A look inside our branches: training floors, cardio zones, strength rooms and classes.',
            viewAll: { label: 'View All', route: '/gallery' },
            preview: 6,
            page: {
                title: 'Our',
                accent: 'Gallery',
                lead: 'Take a look around every branch before your first visit. Pick a branch to see only its photos.',
                seo: { title: 'Gallery', description: 'Photos of the training floors, cardio zones, strength rooms and classes at every {brand} branch.' }
            },
            // Category = branch, in branch order. Photos: Pexels (see fitmanager-infra/docs/CHANGELOG.md 0.10.0); stand-ins until the client's own.
            categories: ['Gulshan', 'Dhanmondi', 'Uttara'],
            items: [
                {
                    src: `${GALLERY}/gulshan-training-floor.webp`,
                    thumb: `${GALLERY}/gulshan-training-floor-sm.webp`,
                    alt: 'Bright training floor with machines and cardio by the windows',
                    category: 'Gulshan',
                    width: 640,
                    height: 427
                },
                {
                    src: `${GALLERY}/dhanmondi-cardio-row.webp`,
                    thumb: `${GALLERY}/dhanmondi-cardio-row-sm.webp`,
                    alt: 'A long row of treadmills on the cardio deck',
                    category: 'Dhanmondi',
                    width: 640,
                    height: 480
                },
                {
                    src: `${GALLERY}/uttara-dumbbell-wall.webp`,
                    thumb: `${GALLERY}/uttara-dumbbell-wall-sm.webp`,
                    alt: 'Dumbbells and medicine balls on racks by a brick wall',
                    category: 'Uttara',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/gulshan-strength-room.webp`,
                    thumb: `${GALLERY}/gulshan-strength-room-sm.webp`,
                    alt: 'Strength room in low light with mirrored machines',
                    category: 'Gulshan',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/dhanmondi-boxing-ring.webp`,
                    thumb: `${GALLERY}/dhanmondi-boxing-ring-sm.webp`,
                    alt: 'Boxing ring and heavy bags in a high-ceilinged hall',
                    category: 'Dhanmondi',
                    width: 640,
                    height: 427
                },
                {
                    src: `${GALLERY}/uttara-window-cardio.webp`,
                    thumb: `${GALLERY}/uttara-window-cardio-sm.webp`,
                    alt: 'Treadmills facing a wall of windows with a hill view',
                    category: 'Uttara',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/gulshan-group-class.webp`,
                    thumb: `${GALLERY}/gulshan-group-class-sm.webp`,
                    alt: 'A coach leading a group class on exercise mats',
                    category: 'Gulshan',
                    width: 640,
                    height: 427
                },
                {
                    src: `${GALLERY}/dhanmondi-hex-lights.webp`,
                    thumb: `${GALLERY}/dhanmondi-hex-lights-sm.webp`,
                    alt: 'Hexagon ceiling lights over the free-weights area',
                    category: 'Dhanmondi',
                    width: 480,
                    height: 640
                },
                {
                    src: `${GALLERY}/uttara-treadmill-sprint.webp`,
                    thumb: `${GALLERY}/uttara-treadmill-sprint-sm.webp`,
                    alt: 'A member sprinting on a curved treadmill',
                    category: 'Uttara',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/gulshan-plate-rack.webp`,
                    thumb: `${GALLERY}/gulshan-plate-rack-sm.webp`,
                    alt: 'Colour-coded weight plates on a rack',
                    category: 'Gulshan',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/dhanmondi-weight-stack.webp`,
                    thumb: `${GALLERY}/dhanmondi-weight-stack-sm.webp`,
                    alt: 'Close-up of a cable machine weight stack',
                    category: 'Dhanmondi',
                    width: 427,
                    height: 640
                },
                {
                    src: `${GALLERY}/uttara-cardio-session.webp`,
                    thumb: `${GALLERY}/uttara-cardio-session-sm.webp`,
                    alt: 'A member checking his pace on the treadmill',
                    category: 'Uttara',
                    width: 640,
                    height: 427
                }
            ]
        },

        faq: {
            title: 'FAQ',
            accent: '',
            items: [
                {
                    question: 'What is {brand} and how can it help me reach my fitness goals?',
                    answer: '{brand} is a fitness club with personalised workout plans, expert coaching and nutrition guidance. Whether you want to lose weight, build muscle or simply stay fit, our tailored programs and community support help you get there.'
                },
                {
                    question: 'How do I get started with a workout plan?',
                    answer: 'Visit any branch, pick a plan at the front desk, and a trainer books an assessment with you. Your first plan is ready after that session.'
                },
                {
                    question: 'Who can share a Duo or Group plan?',
                    answer: 'Anyone you like: a partner, friends, family or colleagues. Duo is for two people and Group for up to four, all members of the same branch.'
                },
                {
                    question: 'Can I change my plan after signing up?',
                    answer: 'Yes. You can switch between Single, Duo and Group at any renewal, and the difference is settled at the front desk.'
                },
                {
                    question: 'What kind of support can I expect from my trainer?',
                    answer: 'Your trainer writes and updates your routine, corrects your form on the floor and answers your questions between sessions.'
                }
            ]
        },

        // Extra public pages, each at `/<slug>`. Placeholder text: replace with the client's own offers and policies.
        pages: [
            {
                slug: 'offers',
                crumb: 'Offers',
                layout: 'cards',
                title: 'Current',
                accent: 'Offers',
                lead: 'Ways to save on your {brand} membership. Ask at any branch front desk to claim an offer.',
                seo: {
                    title: 'Offers & promotions',
                    description: 'Current membership offers and promotions at {brand}: student and couple discounts, referral rewards and more.'
                },
                blocks: [
                    {
                        heading: 'Student discount',
                        text: ['15% off any monthly or annual plan for full-time students.'],
                        list: ['Show a valid student ID', 'Ages 16–25'],
                        note: 'Ongoing'
                    },
                    {
                        heading: 'Company teams',
                        text: ['10% off a Group plan for colleagues from the same company.'],
                        list: ['Show your office ID cards', 'Same branch'],
                        note: 'Ongoing'
                    },
                    {
                        heading: 'Refer a friend',
                        text: ['Get one free month for every friend who joins on a monthly or annual plan.'],
                        list: ['The friend gives your member ID when joining', 'No limit on referrals'],
                        note: 'Ongoing'
                    },
                    {
                        heading: 'No admission fee',
                        text: ['Join any branch this month and pay no admission fee.'],
                        list: ['New members only'],
                        note: 'Until 31 Dec 2026'
                    }
                ]
            },
            {
                slug: 'membership-terms',
                crumb: 'Membership Terms',
                title: 'Membership',
                accent: 'Terms',
                updated: '2026-11-15',
                seo: {
                    title: 'Membership terms',
                    description: 'The terms of a {brand} membership: plans, payment, renewal, branch transfer and cancellation.'
                },
                blocks: [
                    {
                        heading: 'Your membership',
                        text: [
                            'A membership belongs to one member and one branch. It cannot be shared or passed on.',
                            'Bring your member card on every visit; the front desk checks you in with it.'
                        ]
                    },
                    {
                        heading: 'Payment and renewal',
                        text: ['Plans are paid in advance at the front desk, by cash, card or mobile banking. A plan does not renew by itself.'],
                        list: [
                            'Monthly plans run for one calendar month from the start date',
                            'Annual plans run for twelve months',
                            'Renew before the end date to keep your price'
                        ]
                    },
                    {
                        heading: 'Changing branch',
                        text: ['You can move your membership to another branch. Ask the front desk; the move starts on an agreed date.']
                    }
                ]
            },
            {
                slug: 'gym-rules',
                crumb: 'Gym Rules',
                title: 'Gym',
                accent: 'Rules',
                updated: '2026-11-15',
                seo: { title: 'Gym rules', description: 'House rules at every {brand} branch: dress code, equipment, ladies hour and conduct.' },
                blocks: [
                    {
                        heading: 'On the floor',
                        list: [
                            'Wear clean indoor shoes and gym clothes',
                            'Bring a towel and wipe equipment after use',
                            'Put weights back on the rack',
                            'Share equipment between sets at busy times'
                        ]
                    },
                    {
                        heading: 'Ladies hour',
                        text: ['During ladies hour the gym floor is for women only, with women trainers on duty.']
                    },
                    {
                        heading: 'Conduct',
                        text: ['Treat members and staff with respect. The branch may suspend a membership for unsafe or abusive behaviour.']
                    }
                ]
            },
            {
                slug: 'refund-policy',
                crumb: 'Refund & Freeze',
                title: 'Refund &',
                accent: 'Freeze Policy',
                updated: '2026-11-15',
                seo: { title: 'Refund & freeze policy', description: 'How refunds and membership freezes work at {brand}.' },
                blocks: [
                    {
                        heading: 'Freezing a membership',
                        // The plans that may freeze and the shortest and longest freeze are HQ settings (D-063): no numbers here
                        // until this page reads them from the API (phase 2 step 8).
                        text: [
                            'Members on plans that allow it can freeze their membership for travel, illness or injury. The end date moves by the frozen days.'
                        ],
                        list: ['The front desk tells you which plans can freeze, and for how long', 'Ask the front desk before the freeze starts']
                    },
                    {
                        heading: 'Refunds',
                        text: [
                            'A plan can be refunded in full within 3 days of payment if you have not used it.',
                            'After that, plans are not refundable, but a freeze or a branch transfer may help.'
                        ]
                    }
                ]
            },
            {
                slug: 'privacy-policy',
                crumb: 'Privacy Policy',
                title: 'Privacy',
                accent: 'Policy',
                updated: '2026-11-15',
                seo: { title: 'Privacy policy', description: 'What personal data {brand} keeps about members and visitors, and how it is used.' },
                blocks: [
                    {
                        heading: 'What we keep',
                        list: ['Your name, phone number and email', 'Your plan, payments and visits', 'A photo for your member card']
                    },
                    {
                        heading: 'How we use it',
                        text: [
                            'To run your membership: check-ins, renewals, receipts and reminders. We do not sell your data.',
                            'Only the staff of your branch, and head office, can see your record.'
                        ]
                    },
                    {
                        heading: 'Your choices',
                        text: ['Ask the front desk to see, correct or delete your data, or to stop reminders.']
                    }
                ]
            },
            {
                slug: 'terms',
                crumb: 'Terms of Use',
                title: 'Terms of',
                accent: 'Use',
                updated: '2026-11-15',
                seo: { title: 'Terms of use', description: 'Terms for using the {brand} website and member apps.' },
                blocks: [
                    {
                        heading: 'This website',
                        text: ['The information on this site is for general guidance. Prices, hours and offers may change; the front desk has the latest.']
                    },
                    {
                        heading: 'The member apps',
                        text: ['Keep your sign-in details to yourself. You are responsible for what is done with your account.']
                    }
                ]
            },
            {
                slug: 'careers',
                crumb: 'Careers',
                layout: 'cards',
                title: 'Work',
                accent: 'With Us',
                lead: 'We are always looking for people who love fitness. Send your CV to the email in the footer, or drop it at any branch.',
                seo: { title: 'Careers', description: 'Jobs at {brand}: trainers, front desk and branch staff.' },
                blocks: [
                    { heading: 'Personal trainer', text: ['Certified trainers to coach members one to one and on the floor.'], note: 'All branches' },
                    { heading: 'Women trainer', text: ['Certified women trainers for ladies hour and women members.'], note: 'All branches' },
                    { heading: 'Front desk', text: ['Friendly people to welcome members, check them in and take payments.'], note: 'Gulshan' }
                ]
            }
        ],

        footer: {
            about: 'Transform your body with {brand}, your trusted partner in fitness. With over 5 years of experience, we offer expert coaching, tailored workout plans and comprehensive nutritional guidance.',
            aboutLink: { label: 'Join our community', route: '/auth/sign-up' },
            columns: [
                {
                    title: 'Company',
                    links: [
                        { label: 'About Us', fragment: 'about' },
                        { label: 'Our Services', fragment: 'services' },
                        { label: 'Our Branches', fragment: 'branches' },
                        { label: 'Blog', route: '/blog' },
                        { label: 'Gallery', route: '/gallery' },
                        { label: 'Testimonials', fragment: 'reviews' },
                        { label: 'Contact Us', fragment: 'contact' }
                    ]
                },
                {
                    // Shortcuts to the FitManager apps. They all sign in for now; each app opens by the user's role.
                    title: 'Apps',
                    links: [
                        { label: 'Member Portal', route: '/auth/sign-in' },
                        { label: 'Trainer App', route: '/auth/sign-in' },
                        { label: 'Front Desk', route: '/auth/sign-in' },
                        { label: 'Branch Console', route: '/auth/sign-in' },
                        { label: 'HQ Dashboard', route: '/auth/sign-in' }
                    ]
                },
                {
                    title: 'Info',
                    links: [
                        { label: 'Offers', route: '/offers' },
                        { label: 'Membership Terms', route: '/membership-terms' },
                        { label: 'Gym Rules', route: '/gym-rules' },
                        { label: 'Refund & Freeze', route: '/refund-policy' },
                        { label: 'Privacy Policy', route: '/privacy-policy' },
                        { label: 'Terms of Use', route: '/terms' },
                        { label: 'Careers', route: '/careers' }
                    ]
                }
            ],
            // Placeholder contact details and profiles: replace with the client's.
            contact: { title: 'Contact Us', phone: '+880 1700-000000', email: 'hello@example.com' },
            social: [
                { name: 'Facebook', href: 'https://www.facebook.com/', icon: 'facebook' },
                { name: 'Instagram', href: 'https://www.instagram.com/', icon: 'instagram' },
                { name: 'X', href: 'https://x.com/', icon: 'x' },
                { name: 'YouTube', href: 'https://www.youtube.com/', icon: 'youtube' }
            ]
        }
    }
};
