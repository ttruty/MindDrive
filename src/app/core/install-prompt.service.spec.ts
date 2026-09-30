import { TestBed } from '@angular/core/testing';
import {
  BeforeInstallPromptEvent,
  InstallPromptService,
  detectMobile,
  detectPlatform,
} from './install-prompt.service';

const nav = (userAgent: string, maxTouchPoints = 0, mobile?: boolean) =>
  ({ userAgent, maxTouchPoints, ...(mobile === undefined ? {} : { userAgentData: { mobile } }) }) as unknown as Navigator;

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
};

describe('platform detection', () => {
  it('recognises iPhone, iPadOS-as-Mac, Android and desktop', () => {
    expect(detectPlatform(nav(UA.iphone))).toBe('ios');
    expect(detectPlatform(nav(UA.ipad, 5))).toBe('ios');
    expect(detectPlatform(nav(UA.mac, 0))).toBe('other');
    expect(detectPlatform(nav(UA.android))).toBe('android');
  });

  it('treats phones and tablets as mobile, desktops not', () => {
    expect(detectMobile(nav(UA.android), 'android')).toBe(true);
    expect(detectMobile(nav(UA.ipad, 5), 'ios')).toBe(true);
    expect(detectMobile(nav(UA.mac, 0, false), 'other')).toBe(false);
    expect(detectMobile(nav('Something', 0, true), 'other')).toBe(true);
  });
});

describe('InstallPromptService', () => {
  function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
    const prompt = vi.fn(async () => undefined);
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
    return { event, prompt };
  }

  function create(userAgent: string, maxTouchPoints = 0): InstallPromptService {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    // jsdom has no maxTouchPoints, so define it rather than spy on it.
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(InstallPromptService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('offers manual steps on iOS, and respects the snooze', () => {
    const service = create(UA.iphone);
    const now = Date.parse('2026-09-30T12:00:00Z');

    expect(service.method()).toBe('ios-manual');
    expect(service.shouldOfferOnLaunch(now)).toBe(true);

    service.snooze(now);
    expect(service.shouldOfferOnLaunch(now + 6 * 86_400_000)).toBe(false);
    expect(service.shouldOfferOnLaunch(now + 8 * 86_400_000)).toBe(true);
  });

  it('never offers on desktop without an install event', () => {
    const service = create(UA.mac);
    expect(service.method()).toBeNull();
    expect(service.shouldOfferOnLaunch()).toBe(false);
  });

  it('captures beforeinstallprompt, shows the native dialog once, and remembers the install', async () => {
    const service = create(UA.android);
    expect(service.method()).toBeNull(); // nothing to offer until Chrome says it's installable

    const { event, prompt } = fakePromptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // Chrome's own mini-infobar suppressed
    expect(service.method()).toBe('native');
    expect(service.shouldOfferOnLaunch()).toBe(true);

    expect(await service.promptNative()).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(service.installed()).toBe(true);
    expect(service.method()).toBeNull();
    expect(await service.promptNative()).toBe(false); // the event is single-use
  });

  it('stops offering after the appinstalled event', () => {
    const service = create(UA.iphone);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.installed()).toBe(true);
    expect(service.shouldOfferOnLaunch()).toBe(false);
  });
});
