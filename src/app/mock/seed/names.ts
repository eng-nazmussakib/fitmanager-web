/** Bangladeshi first and last names (written in English), Dhaka areas and mobile prefixes, for the seed. */
export const MALE_NAMES = [
    'Rahim',
    'Karim',
    'Tanvir',
    'Arif',
    'Imran',
    'Shakib',
    'Rakib',
    'Sabbir',
    'Mahmud',
    'Fahim',
    'Nayeem',
    'Rafiq',
    'Jamal',
    'Habib',
    'Sohel',
    'Mehedi',
    'Rashed',
    'Asif',
    'Zahid',
    'Tariq',
    'Rifat',
    'Shuvo',
    'Anik',
    'Ratul',
    'Sajid',
    'Hasan',
    'Faisal',
    'Masud',
    'Kamrul',
    'Shafiq',
    'Ashraf',
    'Riyad',
    'Tahmid',
    'Ehsan',
    'Mushfiq',
    'Nafis',
    'Rayhan',
    'Siam',
    'Tamim',
    'Yasir'
] as const;

export const FEMALE_NAMES = [
    'Nusrat',
    'Farhana',
    'Sadia',
    'Tasnim',
    'Ayesha',
    'Fatema',
    'Sumaiya',
    'Nadia',
    'Rumana',
    'Sharmin',
    'Tahmina',
    'Lamia',
    'Mim',
    'Jannat',
    'Sabrina',
    'Mehjabin',
    'Anika',
    'Raisa',
    'Tanjila',
    'Nabila',
    'Sanjida',
    'Afroza',
    'Ishrat',
    'Maliha',
    'Zarin'
] as const;

export const LAST_NAMES = [
    'Uddin',
    'Ahmed',
    'Hasan',
    'Hossain',
    'Islam',
    'Rahman',
    'Khan',
    'Chowdhury',
    'Akter',
    'Begum',
    'Sarker',
    'Talukder',
    'Mia',
    'Siddique',
    'Karim',
    'Haque',
    'Alam',
    'Kabir',
    'Mahmud',
    'Sultana',
    'Jahan',
    'Bhuiyan',
    'Mollah',
    'Sheikh',
    'Biswas',
    'Das',
    'Roy',
    'Saha'
] as const;

/** Women's last names that read as women's only. */
export const FEMALE_ONLY_LAST = new Set(['Akter', 'Begum', 'Sultana', 'Jahan']);

export const AREAS: Record<string, readonly string[]> = {
    GUL: ['Gulshan 1', 'Gulshan 2', 'Banani', 'Baridhara', 'Niketan', 'Badda'],
    DHA: ['Dhanmondi', 'Lalmatia', 'Mohammadpur', 'Kalabagan', 'Jigatola', 'Shankar'],
    UTT: ['Uttara Sector 4', 'Uttara Sector 7', 'Uttara Sector 11', 'Uttara Sector 13', 'Diabari', 'Airport Road']
};

/** Grameenphone, Banglalink, Robi, Teletalk… */
export const MOBILE_PREFIXES = ['013', '014', '015', '016', '017', '018', '019'] as const;

export const HEALTH_FLAGS = ['Asthma', 'Knee injury', 'Lower back pain', 'High blood pressure', 'Diabetes', 'Shoulder injury', 'Pregnancy'] as const;

export const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Friend'] as const;
