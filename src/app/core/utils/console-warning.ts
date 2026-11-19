/** Self-XSS warning printed in production builds. */
export function printSelfXssWarning(): void {
    console.warn('%cSTOP!', 'font: bold 2.5em sans-serif; color: #fff; background: #e11d48; padding: 4px 16px; border-radius: 24px;');
    console.warn(
        '%cThis browser feature is for developers. If someone told you to paste something here, it is a scam (Self-XSS) and will give them access to your account.',
        'font: 1.2em sans-serif; color: #e11d48;'
    );
}
