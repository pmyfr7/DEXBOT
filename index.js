<xaiArtifact artifact_id="591ba2d6-a2e1-4287-b6ab-edb99d483974" artifact_version_id="37fd000f-0044-433b-8f48-e05fc69ad4b2" title=">indexy." require('dotenv').config(); const { Telegraf, Scenes, session } = require('telegraf'); const mongoose = need('mongoose'); const crypto = require('crypto');
// مقداردهی اولیه ربات
const bot = new Telegraf(process.env.BOT_TOKEN);

// به MongoDB متصل شوید
mongoose.connect(process.env.MONGODB_URI، { useNewUrlParser: true، useUnifiedTopology: true })
.then(() => console.log('متصل به MongoDB'))
.catch(err => console.error('خطای اتصال MongoDB:'، er));

// طرحواره ها
const userSchema = new mongoose.Schema({
شناسه تلگرام: رشته،
نام: رشته،
نام خانوادگی: رشته
تلفن: رشته،
نام کاربری: رشته،
joinDate: تاریخ،
userType: { type: String, enum: ['Regular', 'VIP'], default: 'Regular' },
vipExpiry: تاریخ،
امتیاز: {نوع: عدد، پیش‌فرض: 0 }،
پیوند ارجاع: رشته،
آدرس IP: رشته،
activeDuration: { type: Number, default: 0 }, // Days active
ارجاع شده توسط: رشته،
})؛
const signalSchema = new mongoose.Schema({
signalId: رشته،
تصاویر: [رشته]،
متن: رشته،
target: { type: String, enum: ['Regular', 'VIP'] },
assignedUsers: [{ telegramId: String, sentAt: Date }],
})؛
const paymentSchema = new mongoose.Schema({
شناسه کاربر: رشته،
plan: { type: String, enum: ['1-month', '3-month', '6-month', '12-month'] },
اثبات: رشته،
status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
ایجاد شده در: تاریخ،
})؛
const feedbackSchema = new mongoose.Schema({
شناسه کاربر: رشته،
type: { type: String, enum: ['complaint', 'suggestion', 'sue'] },
پیام: رشته،
ایجاد شده در: تاریخ،
})؛

const User = mongoose.model('User', userSchema);
const Signal = mongoose.model('Signal', signalSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// صحنه ثبت نام
const registerScene = new Scenes.WizardScene(
"ثبت نام"،
ناهمگام (ctx) => {
await ctx.reply('لطفا نام خود را وارد کنید:');
بازگشت ctx.wizard.next();
}،
ناهمگام (ctx) => {
if (!ctx.message?.text) return ctx.reply('لطفا نام خود را به صورت متن ارسال کنید.');
ctx.wizard.state.name = ctx.message.text;
await ctx.reply('لطفا نام خانوادگی خود را وارد کنید:');
بازگشت ctx.wizard.next();
}،
ناهمگام (ctx) => {
if (!ctx.message?.text) return ctx.reply('لطفا نام خانوادگی خود را به صورت متن ارسال کنید');
ctx.wizard.state.surname = ctx.message.text;
await ctx.reply('لطفا شماره تلفن خود را ارسال کنید (به عنوان مثال 989399042848):');
بازگشت ctx.wizard.next();
}،
ناهمگام (ctx) => {
if (!ctx.message?.text) return ctx.reply('لطفا یک شماره تلفن معتبر ارسال کنید.');
const phone = ctx.message.text.replace(/\D/g، '');
if (phone !== ctx.from.id.toString()) { // بررسی ساده شده
await ctx.reply ('شماره تلفن باید با حساب تلگرام شما مطابقت داشته باشد.');
بازگشت ctx.scene.leave();
}
const hash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
const username = DExtrading_${hash} ;
const referralLink = t.me/${ctx.botInfo.username}?start=${username} ;
const user = کاربر جدید({
telegramId: ctx.from.id،
نام: ctx.wizard.state.name،
نام خانوادگی: ctx.wizard.state.نام خانوادگی،
تلفن،
نام کاربری،
joinDate: new Date()،
پیوند ارجاع،
ipAddress: ctx.message.from.ip || "ناشناخته"،
referBy: ctx.session.referredBy || پوچ،
})؛
await user.save();
await ctx.reply( ثبت نام کامل شد! نام کاربری شما: ${username}\nلطفاً به کانال ما بپیوندید: @TradingSignals );
بازگشت ctx.scene.leave();
}
)

// راه اندازی مرحله
const stage = new Scenes.Stage([registrationScene]);
bot.use(session());
bot.use(stage.middleware());

// دستور شروع
bot.start(async (ctx) => {
const user = await User.findOne({ telegramId: ctx.from.id });
const ارجاع = ctx.startPayload;
if (ارجاع) ctx.session.referredBy = ارجاع;
اگر (! کاربر) {
await ctx.reply('خوش آمدید! بیایید شما را ثبت کنیم.');
بازگشت ctx.scene.enter('ثبت نام');
}
منتظر showMainMenu (ctx);
})؛

// منوی اصلی
تابع async showMainMenu(ctx) {
const user = await User.findOne({ telegramId: ctx.from.id });
صفحه کلید const = {
inline_keyboard: [
[{ text: 'Contact Admin', callback_data: 'contact_admin' }],
[{ text: 'Report Issue', callback_data: 'report_issue' }],
[{ text: 'ارسال شکایت'، callback_data: 'submit_complaint' }]،
[{ text: 'Send Suggestion', callback_data: 'send_suggestion' }],
[{ text: 'اشتراک VIP'، callback_data: 'vip_subscription' }]،
[{ text: 'Referral Stats', callback_data: 'referral_stats' }],
[{ text: 'دعوت از دوستان'، callback_data: 'invite_friends' }]،
]،
};
await ctx.reply( سلام ${user.name}! چه کاری می خواهید انجام دهید؟ , { reply_markup: keyboard });
}

// رسیدگی به تماس ها
bot.action('contact_admin', async (ctx) => {
await ctx.reply('لطفا پیام خود را برای مدیر ارسال کنید:');
ctx.session.waitingFor = 'admin_message';
})؛
bot.action('report_issue', async (ctx) => {
await ctx.reply('لطفاً مشکل را شرح دهید:');
ctx.session.waitingFor = 'مشکل';
})؛
bot.action('submit_complaint', async (ctx) => {
await ctx.reply('لطفا شکایت خود را شرح دهید:');
ctx.session.waitingFor = 'شکایت';
})؛
bot.action('send_suggestion', async (ctx) => {
await ctx.reply('لطفا پیشنهاد خود را به اشتراک بگذارید:');
ctx.session.waitingFor = 'پیشنهاد';
})؛
bot.action('vip_subscription', async (ctx) => {
صفحه کلید const = {
inline_keyboard: [
[{ text: '1 ماه'، callback_data: 'vip_1month' }]،
[{ text: '3 ماه'، callback_data: 'vip_3month' }]،
[{ متن: '6 ماه'، callback_data: 'vip_6month' }]،
[{ text: '12 ماه'، callback_data: 'vip_12month' }]،
[{ text: 'Redeem Points', callback_data: 'redeem_points' }],
]،
};
await ctx.reply('یک طرح VIP را انتخاب کنید (هزینه ها به عنوان مثال):\n1 ماه: 10 دلار\n3 ماه: 25 دلار\n6 ماه: 45 دلار\n12 ماه: 80 دلار', { reply_markup: صفحه کلید });
})؛
bot.action(/vip_(\d+)month/, async (ctx) => {
const months = parseInt(ctx.match[1]);
await ctx.reply('لطفا مدرک پرداخت را ارسال کنید (مثلاً اسکرین شات).');
ctx.session.waitingFor = payment_${months} ​​;
})؛
bot.action('redeem_points', async (ctx) => {
const user = await User.findOne({ telegramId: ctx.from.id });
if (user.points < 10) { // مثال: 10 امتیاز برای 1 ماه
await ctx.reply('امتیاز کافی نیست! برای 1 ماه VIP به 10 امتیاز نیاز دارید.');
بازگشت؛
}
user.points -= 10;
user.userType = 'VIP';
user.vipExpiry = تاریخ جدید (Date.now() + 30 * 24 * 60 * 60 * 1000); // 1 ماه
await user.save();
await ctx.reply('VIP با استفاده از 10 امتیاز به مدت 1 ماه فعال شد!');
})؛
bot.action('stats_referral', async (ctx) => {
const user = await User.findOne({ telegramId: ctx.from.id });
const referrals = await User.find({ referenceBy: user.username });
const تکمیل = referrals.filter(r => r.joinDate).length;
const vipReferrals = referrals.filter(r => r.userType === 'VIP').length;
const pointsFromReferrals = تکمیل شده * 1;
const pointsFromVIP = vipReferrals * 3;
const totalPoints = pointsFromReferrals + pointsFromVIP;
const pointsSpent = user.points < totalPoints ? totalPoints - user.points : 0;
const message = `
آمار ارجاع شما:

مجموع ارجاعات: ${referrals.length}
ثبت نام های تکمیل شده: ${completed} (+${pointsFromReferrals} امتیاز)
اشتراک VIP: ${vipReferrals} (+${pointsFromVIP} امتیاز)
مجموع امتیازهای کسب شده: ${totalPoints}
امتیازات صرف شده: ${pointsSpent}
امتیاز باقیمانده: ${user.points}
به دعوت خود ادامه دهید تا زمان VIP بیشتری کسب کنید!
دعوت: ${user.referralLink}
; await ctx.reply(پیام); })؛ bot.action('invite_friends', async (ctx) => { const user = await User.findOne({ telegramId: ctx.from.id }); const guestsText = برای سیگنال های انحصاری با نمودارها، نقاط ورودی و 3 هدف خروجی به ربات تجاری ما بپیوندید ! پیوند دعوت: ${user.referralLink}\n\nاین را به اشتراک بگذارید:\n${inviteText}`);
})؛

// مدیریت پیام ها
bot.on('message', async (ctx) => {
const user = await User.findOne({ telegramId: ctx.from.id });
if (!user) return ctx.scene.enter('registration');
if (ctx.session.waitingFor) {
const type = ctx.session.waitingFor;
if (type.startsWith('payment_')) {
const months = parseInt(type.split('_')[1]);
پرداخت مستمر = پرداخت جدید({
شناسه کاربر: ctx.from.id،
طرح: ${months} -month
اثبات: ctx.message.photo ? ctx.message.photo[0].file_id : ctx.message.text,
createAt: new Date()،
})؛
await payment.save();
await ctx.reply('مدرک پرداخت ارسال شد. در انتظار تایید مدیر.');
await bot.telegram.sendMessage('ADMIN_ID'، پرداخت جدید از ${user.username} برای ${months}-month VIP. اثبات: ${payment.proof} );
} else if (['sue', 'complaint', 'suggestion'].includes(type)) {
بازخورد const = بازخورد جدید({
شناسه کاربر: ctx.from.id،
نوع،
پیام: ctx.message.text،
createAt: new Date()،
})؛
await feedback.save();
پاسخ های مستمر = {
شماره: 'مشکل شما ثبت شده است. تیم ما به زودی آن را بررسی خواهد کرد.'،
شکایت: 'شکایت شما ثبت شده است. ما به سرعت به آن رسیدگی خواهیم کرد.'،
پیشنهاد: "از پیشنهاد شما متشکرم! به تیم ما ارسال شده است.'،
};
await ctx.reply(responses[type]);
await bot.telegram.sendMessage('ADMIN_ID', ${type} from ${user.username}: ${ctx.message.text} );
} else if (نوع === 'admin_message') {
await bot.telegram.sendMessage('ADMIN_ID', پیام از ${user.username}: ${ctx.message.text} );
await ctx.reply('پیام شما برای مدیر ارسال شد');
}
ctx.session.waitingFor = null;
}
})؛

// دستورات مدیر
bot.command('upload_signal', async (ctx) => {
if (ctx.from.id.toString() !== 'ADMIN_ID') بازگشت;
await ctx.reply('لطفاً تصاویر و متن را برای سیگنال ارسال کنید و هدف را مشخص کنید (به طور منظم/VIP).');
ctx.session.waitingFor = 'signal_upload';
})؛
bot.on('photo', async (ctx) => {
if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === 'ADMIN_ID') {
ctx.session.signal = ctx.session.signal || { تصاویر: []، متن: ''، هدف: '' };
ctx.session.signal.images.push(ctx.message.photo[0].file_id);
await ctx.reply ('تصویر دریافت شد. ارسال تصاویر، متن یا هدف بیشتر (به طور منظم/VIP).');
}
})؛
bot.on('text', async (ctx) => {
if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === 'ADMIN_ID') {
if (['Regular', 'VIP'].includes(ctx.message.text)) {
ctx.session.signal.target = ctx.message.text;
سیگنال const = سیگنال جدید({
signalId: crypto.randomBytes(16).toString('hex'),
تصاویر: ctx.session.signal.images,
متن: ctx.session.signal.text،
target: ctx.session.signal.target،
assignedUsers: []،
})؛
await signal.save();
await distributeSignal(signal);
await ctx.reply('Signal saved and distributed.');
ctx.session.signal = null;
ctx.session.waitingFor = null;
}دیگر {
ctx.session.signal.text = ctx.message.text;
await ctx.reply('متن دریافت شد. ارسال هدف (به طور منظم/VIP) برای تکمیل.');
}
}
})؛

// توزیع سیگنال ها
تابع async distributeSignal(signal) {
const users = await User.find({ userType: signal.target });
const numSignals = signal.images.length;
const groupSize = Math.ceil(users.length / numSignals);
const group = [];
برای (بگذارید i = 0; i < users.length; i += groupSize) {
group.push(users.slice(i، i + groupSize));
}
برای (بگذارید i = 0; i < group.length && i < numSignals; i++) {
const image = signal.images[i % signal.images.length];
برای (const user of group[i]) {
await bot.telegram.sendPhoto(user.telegramId, image, { caption: signal.text });
signal.assignedUsers.push({ telegramId: user.telegramId, sentAt: new Date() });
}
}
await signal.save();
}

// انقضای VIP را بررسی کنید
setInterval(async () => {
const users = await User.find({ userType: 'VIP', vipExpiry: { $exists: true } });
const now = new Date();
برای (کاربر ثابت کاربران) {
const daysLeft = Math.ceil((user.vipExpiry - now) / (24 * 60 * 60 * 1000));
if (daysLeft <= 3 && daysLeft > 0) {
await bot.telegram.sendMessage(user.telegramId، اشتراک VIP شما در ${daysLeft} روز دیگر منقضی می شود! اینجا را تمدید کنید: , {
reply_markup: {
inline_keyboard: [[{ text: 'تجدید VIP'، callback_data: 'vip_subscription' }]]،
}،
})؛
}
if (daysLeft <= 0) {
user.userType = 'به طور منظم';
user.vipExpiry = null;
await user.save();
await bot.telegram.sendMessage(user.telegramId، 'اشتراک VIP شما منقضی شده است. برای ادامه دسترسی، تمدید کنید.');
}
}
}، 24 * 60 * 60 * 1000)؛ // چک روزانه

// مدت زمان فعال را به روز کنید
setInterval(async () => {
const users = await User.find({});
برای (کاربر ثابت کاربران) {
user.activeDuration = Math.floor((تاریخ جدید() - user.joinDate) / (24 * 60 * 60 * 1000));
await user.save();
}
}، 24 * 60 * 60 * 1000)؛ // به روز رسانی روزانه

// شروع ربات
bot.launch();
console.log('Bot running...');

// Webhook for Render
if (process.env.NODE_ENV === 'production') {
bot.webhookCallback('/bot');
}