/** Tone-specific Turkish reply drafts. Fixed copy for the design-reference threads, templates otherwise. */
import type { EmailThread, FollowUp, ReplyTone } from '@da/domain';
import type { DemoContext } from '../context';
import { dayMonthLong, firstName } from '../format';
import {
  THREAD_AHMET_REVIZE,
  THREAD_HUKUK_SOZLESME,
  THREAD_MEHMET_TEKLIF_V2,
  THREAD_MEHMET_TOPLANTI,
  THREAD_SELIN_SOZLESME,
} from '../ids';
import { counterpartOf } from './lookup';

export type ToneDrafts = Record<ReplyTone, string>;

function ahmet(me: string): ToneDrafts {
  return {
    short: `Merhaba Ahmet,\n\nRevize teklifi bugün 17:00'den önce PDF olarak göndereceğim.\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba Ahmet,\n\nTalebiniz için teşekkürler. Revize fiyat teklifini, güncellenmiş teslim tarihiyle birlikte bugün 17:00'den önce PDF formatında iletiyor olacağım.\n\nSorularınız olursa memnuniyetle yardımcı olurum.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Selam Ahmet,\n\nMesajın için teşekkürler! Revize teklifi bugün 17:00'den önce PDF olarak yolluyorum, merak etme.\n\nGörüşmek üzere,\n${me}`,
    detailed: `Merhaba Ahmet,\n\nRevize teklife ilişkin talebinizi aldım. Fiyat kalemlerini güncelledim, teslim tarihini Ekim başı olarak netleştirdim ve sözleşme taslağına atıf ekledim. Belgeyi bugün 17:00'den önce PDF olarak göndereceğim.\n\nEk bir kalem veya değişiklik isterseniz lütfen belirtin.\n\nİyi çalışmalar,\n${me}`,
  };
}

function mehmetFollowUp(me: string, sentDate: string): ToneDrafts {
  return {
    short: `Merhaba Mehmet,\n\n${sentDate}'de ilettiğim teklif hakkında görüşünüzü alabilir miyim?\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba Mehmet,\n\n${sentDate}'de ilettiğim teklifle ilgili değerlendirmenizi öğrenmek isterim. Sorularınız varsa bugünkü görüşmemizde ele alabiliriz.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Selam Mehmet,\n\nGeçen hafta yolladığım teklife bakma fırsatın oldu mu? Bugün görüştüğümüzde üzerinden geçebiliriz.\n\nGörüşmek üzere,\n${me}`,
    detailed: `Merhaba Mehmet,\n\n${sentDate}'de ilettiğim teklifte fiyat, teslim tarihi ve sözleşme koşullarını özetlemiştim. Değerlendirmenizi ve varsa revize taleplerinizi bugünkü 14:30 görüşmemiz öncesinde alabilirsem toplantıyı daha verimli kullanabiliriz.\n\nİyi çalışmalar,\n${me}`,
  };
}

function selin(me: string): ToneDrafts {
  return {
    short: `Merhaba Selin,\n\n4. madde yorumumu yarın öğlenden önce iletiyorum.\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba Selin,\n\nHatırlatma için teşekkürler. Sözleşme taslağının 4. maddesine (fesih koşulları) ilişkin yorumumu yarın öğlenden önce, hukuk departmanına gitmeden iletiyor olacağım.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Selam Selin,\n\n4. maddeye bugün bakıyorum; yorumumu yarın öğlenden önce sana yollarım.\n\nSevgiler,\n${me}`,
    detailed: `Merhaba Selin,\n\nSözleşme taslağının 4. maddesindeki fesih koşullarını inceliyorum. Özellikle bildirim süresi ve cezai şart kalemleri için birkaç düzeltme önerim olacak; yorumumu yarın öğlenden önce, taslak hukuk departmanına gitmeden iletiyor olacağım.\n\nİyi çalışmalar,\n${me}`,
  };
}

function mehmetReschedule(me: string): ToneDrafts {
  return {
    short: `Merhaba Mehmet Bey,\n\n16:00 dolu; 16:30 sizin için uygun mu?\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba Mehmet Bey,\n\nBilgilendirme için teşekkürler. 16:00'da başka bir toplantım var; görüşmemizi 16:30'a almayı öneriyorum. Sizin için uygunsa daveti güncelliyorum.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Merhaba Mehmet Bey,\n\nSorun değil, olur böyle aksilikler. 16:00 bende dolu ama 16:30 uygunsa daveti hemen güncelleyeyim.\n\nGörüşmek üzere,\n${me}`,
    detailed: `Merhaba Mehmet Bey,\n\nBilgilendirme için teşekkürler. 16:00–16:30 arasında ürün gözden geçirme toplantım olduğu için görüşmemizi 16:30'a almayı öneriyorum; teklif v2, teslim takvimi ve sözleşme maddesini bir saatte rahatlıkla ele alabiliriz. Uygunsa takvim davetini güncelliyorum, Meet bağlantısı aynı kalacak.\n\nİyi çalışmalar,\n${me}`,
  };
}

function hukuk(me: string, sentDate: string): ToneDrafts {
  return {
    short: `Merhaba,\n\n${sentDate}'de ilettiğim sözleşme taslağı için yorumunuzu alabilir miyim?\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba,\n\n${sentDate}'de ilettiğim sözleşme taslağının 4. maddesine ilişkin yorumunuzu bekliyorum. Müşteri tarafı bu hafta netleşmesini rica ediyor; dönüşünüz için teşekkürler.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Merhaba,\n\nSözleşme taslağına bakma fırsatınız oldu mu? 4. madde için görüşünüzü bu hafta alabilirsem çok sevinirim.\n\nTeşekkürler,\n${me}`,
    detailed: `Merhaba,\n\n${sentDate}'de ilettiğim sözleşme taslağının 4. maddesi (fesih koşulları) için yorumunuzu rica etmiştim. Müşteri tarafı fesih bildirim süresi ve cezai şart kalemlerinde netlik bekliyor; bu hafta içinde dönüş alabilirsem taslağı imzaya hazırlayabiliriz.\n\nİyi çalışmalar,\n${me}`,
  };
}

function generic(me: string, name: string, subject: string, keyPoint: string | null): ToneDrafts {
  const point = keyPoint ? ` "${keyPoint}" konusunu` : ' konuyu';
  return {
    short: `Merhaba ${name},\n\n"${subject}" için teşekkürler; en kısa sürede dönüş yapacağım.\n\nİyi çalışmalar,\n${me}`,
    professional: `Merhaba ${name},\n\n"${subject}" konulu mesajınız için teşekkür ederim.${point} inceledim; detaylı dönüşümü en kısa sürede ileteceğim.\n\nİyi çalışmalar,\n${me}`,
    friendly: `Selam ${name},\n\nMesajın için teşekkürler! "${subject}" konusuna bakıyorum, kısa sürede sana dönerim.\n\nGörüşmek üzere,\n${me}`,
    detailed: `Merhaba ${name},\n\n"${subject}" konulu mesajınızı aldım ve${point} inceledim. Gerekli kontrolleri tamamladıktan sonra tüm sorularınızı kapsayan bir dönüş yapacağım; ek bir bilgiye ihtiyaç duyarsam sizinle iletişime geçeceğim.\n\nİyi çalışmalar,\n${me}`,
  };
}

export function replyDraftsFor(ctx: DemoContext, thread: EmailThread): ToneDrafts {
  const me = ctx.userName;
  const state = ctx.store.state;
  switch (thread.id) {
    case THREAD_AHMET_REVIZE:
      return ahmet(me);
    case THREAD_MEHMET_TEKLIF_V2:
      return mehmetFollowUp(me, dayMonthLong(ctx.clock.dateKey(thread.lastMessageAt)));
    case THREAD_SELIN_SOZLESME:
      return selin(me);
    case THREAD_MEHMET_TOPLANTI:
      return mehmetReschedule(me);
    case THREAD_HUKUK_SOZLESME:
      return hukuk(me, dayMonthLong(ctx.clock.dateKey(thread.lastMessageAt)));
    default: {
      const other = counterpartOf(state, thread);
      const name = other?.name ? firstName(other.name) : 'Merhaba';
      return generic(me, name, thread.subject, thread.analysis?.keyPoints[0] ?? null);
    }
  }
}

export function applyInstructions(draft: string, instructions: string | undefined): string {
  if (!instructions?.trim()) return draft;
  const note = instructions.trim();
  const lines = draft.split('\n');
  const signatureIndex = lines.findIndex((l) =>
    /^(İyi çalışmalar|Görüşmek üzere|Sevgiler|Saygılarımla|Teşekkürler),$/.test(l),
  );
  const insertAt = signatureIndex > 0 ? signatureIndex - 1 : lines.length;
  lines.splice(insertAt, 0, note, '');
  return lines.join('\n');
}

export function followUpDraftFor(
  ctx: DemoContext,
  followUp: FollowUp,
  thread: EmailThread,
): string {
  const drafts = replyDraftsFor(ctx, thread);
  if (thread.id === THREAD_MEHMET_TEKLIF_V2 || thread.id === THREAD_HUKUK_SOZLESME)
    return drafts.professional;
  const name = firstName(followUp.counterpartName);
  const sent = dayMonthLong(ctx.clock.dateKey(followUp.sentAt));
  return `Merhaba ${name},\n\n${sent}'de ilettiğim "${followUp.topic}" konusu hakkında görüşünüzü alabilir miyim? Ek bir bilgiye ihtiyaç duyarsanız memnuniyetle iletirim.\n\nİyi çalışmalar,\n${ctx.userName}`;
}
