require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  telegramId: String,
  name: String,
  surname: String,
  phone: String,
  username: String,
  joinDate: Date,
  userType: { type: String, enum: ['Regular', 'VIP'], default: 'Regular' },
  vipExpiry: Date,
  points: { type: Number, default: 0 },
  referralLink: String,
  ipAddress: String,
  activeDuration: { type: Number, default: 0 }, // Days active
  referredBy: String,
});
const signalSchema = new mongoose.Schema({
  signalId: String,
  images: [String],
  text: String,
  target: { type: String, enum: ['Regular', 'VIP'] },
  assignedUsers: [{ telegramId: String, sentAt: Date }],
});
const paymentSchema = new mongoose.Schema({
  userId: String,
  plan: { type: String, enum: ['1-month', '3-month', '6-month', '12-month'] },
  proof: String,
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  createdAt: Date,
});
const feedbackSchema = new mongoose.Schema({
  userId: String,
  type: { type: String, enum: ['complaint', 'suggestion', 'issue'] },
  message: String,
  createdAt: Date,
});

const User = mongoose.model('User', userSchema);
const Signal = mongoose.model('Signal', signalSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// Registration Scene
const registrationScene = new Scenes.WizardScene(
  'registration',
  async (ctx) => {
    await ctx.reply('سلام! 😍 بیا ثبت‌نام کنیم! \nاول اسمت رو بگو:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'لغو ثبت‌نام 🚫', callback_data: 'cancel_registration' }],
        ],
      },
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('لطفاً اسمت رو به صورت متن بفرست! 😊');
      return;
    }
    ctx.wizard.state.name = ctx.message.text;
    await ctx.reply(`ممنون ${ctx.wizard.state.name}! حالا فامیلیت رو بگو: 🖌️`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'برگشت 🔙', callback_data: 'back_to_name' }],
          [{ text: 'لغو ثبت‌نام 🚫', callback_data: 'cancel_registration' }],
        ],
      },
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('لطفاً فامیلیت رو به صورت متن بفرست! 😊');
      return;
    }
    ctx.wizard.state.surname = ctx.message.text;
    await ctx.reply('عالیه! حالا شماره تماست رو بفرست (مثلاً 989399042848): 📞', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'برگشت 🔙', callback_data: 'back_to_surname' }],
          [{ text: 'لغو ثبت‌نام 🚫', callback_data: 'cancel_registration' }],
        ],
      },
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('لطفاً شماره تماست رو به صورت متن بفرست! 😊');
      return;
    }
    const phone = ctx.message.text.replace(/\D/g, '');
    if (phone !== ctx.from.id.toString()) { // Simplified check
      await ctx.reply('شماره تماس باید با حساب تلگرامت مطابقت داشته باشه! 😓');
      return ctx.scene.leave();
    }
    const hash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
    const username = `DExtrading_${hash}`;
    const referralLink = `t.me/${ctx.botInfo.username}?start=${username}`;
    const user = new User({
      telegramId: ctx.from.id,
      name: ctx.wizard.state.name,
      surname: ctx.wizard.state.surname,
      phone,
      username,
      joinDate: new Date(),
      referralLink,
      ipAddress: ctx.message.from.ip || 'unknown',
      referredBy: ctx.session.referredBy || null,
    });
    await user.save();
    await ctx.reply(`ثبت‌نام با موفقیت انجام شد! 🎉\nیوزرنیم تو: ${username}\nلطفاً به کانالم بپیوند: @TradingSignals`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ورود به کانال 📢', url: 'https://t.me/TradingSignals' }],
        ],
      },
    });
    return ctx.scene.leave();
  }
);

// Handle cancel and back actions
bot.action('cancel_registration', async (ctx) => {
  await ctx.reply('ثبت‌نام لغو شد! اگه خواستی دوباره شروع کنی، کافیه /start رو بزنی 😊');
  return ctx.scene.leave();
});
bot.action('back_to_name', async (ctx) => {
  await ctx.reply('بیا دوباره اسمت رو بگو: 😊');
  return ctx.wizard.selectStep(0);
});
bot.action('back_to_surname', async (ctx) => {
  await ctx.reply(`خب ${ctx.wizard.state.name}، حالا فامیلیت رو بگو: 🖌️`);
  return ctx.wizard.selectStep(1);
});

// Stage setup
const stage = new Scenes.Stage([registrationScene]);
bot.use(session());
bot.use(stage.middleware());

// Start command
bot.start(async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const referral = ctx.startPayload;
  if (referral) ctx.session.referredBy = referral;
  if (!user) {
    await ctx.reply('سلام خوش اومدی! 😍 بیا با هم ثبت‌نام کنیم! 🚀');
    return ctx.scene.enter('registration');
  }
  await showMainMenu(ctx);
});

// Main menu
async function showMainMenu(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const keyboard = {
    inline_keyboard: [
      [{ text: 'ارتباط با ادمین 📞', callback_data: 'contact_admin' }],
      [{ text: 'گزارش مشکل 🛠️', callback_data: 'report_issue' }],
      [{ text: 'ثبت شکایت 😡', callback_data: 'submit_complaint' }],
      [{ text: 'ارسال پیشنهاد 💡', callback_data: 'send_suggestion' }],
      [{ text: 'اشتراک VIP 🌟', callback_data: 'vip_subscription' }],
      [{ text: 'آمار دعوت‌ها 📊', callback_data: 'referral_stats' }],
      [{ text: 'دعوت از دوستان 🎉', callback_data: 'invite_friends' }],
    ],
  };
  await ctx.reply(`سلام ${user.name} جان! 😊 چیکار می‌خوای بکنی؟`, { reply_markup: keyboard });
}

// Handle callbacks
bot.action('contact_admin', async (ctx) => {
  await ctx.reply('پیامت رو برای ادمین بفرست: ✍️');
  ctx.session.waitingFor = 'admin_message';
});
bot.action('report_issue', async (ctx) => {
  await ctx.reply('مشکلت رو بگو، سریع بررسی می‌کنیم! 🛠️');
  ctx.session.waitingFor = 'issue';
});
bot.action('submit_complaint', async (ctx) => {
  await ctx.reply('شکایتت رو بگو، حتماً پیگیری می‌کنیم! 😡');
  ctx.session.waitingFor = 'complaint';
});
bot.action('send_suggestion', async (ctx) => {
  await ctx.reply('پیشنهادت چیه؟ خیلی خوشحال می‌شیم بشنویم! 💡');
  ctx.session.waitingFor = 'suggestion';
});
bot.action('vip_subscription', async (ctx) => {
  const keyboard = {
    inline_keyboard: [
      [{ text: '۱ ماهه (۱۰۰ تومن)', callback_data: 'vip_1month' }],
      [{ text: '۳ ماهه (۲۵۰ تومن)', callback_data: 'vip_3month' }],
      [{ text: '۶ ماهه (۴۵۰ تومن)', callback_data: 'vip_6month' }],
      [{ text: '۱۲ ماهه (۸۰۰ تومن)', callback_data: 'vip_12month' }],
      [{ text: 'استفاده از امتیازات 🌟', callback_data: 'redeem_points' }],
    ],
  };
  await ctx.reply('یه پلن VIP انتخاب کن:\n۱ ماهه: ۱۰۰ تومن\n۳ ماهه: ۲۵۰ تومن\n۶ ماهه: ۴۵۰ تومن\n۱۲ ماهه: ۸۰۰ تومن', { reply_markup: keyboard });
});
bot.action(/vip_(\d+)month/, async (ctx) => {
  const months = parseInt(ctx.match[1]);
  await ctx.reply('لطفاً مدرک پرداختت رو بفرست (مثلاً اسکرین‌شات): 📸');
  ctx.session.waitingFor = `payment_${months}`;
});
bot.action('redeem_points', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (user.points < 10) { // Example: 10 points for 1 month
    await ctx.reply('امتیاز کافی نداری! باید حداقل ۱۰ امتیاز داشته باشی برای ۱ ماه VIP. 😓');
    return;
  }
  user.points -= 10;
  user.userType = 'VIP';
  user.vipExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 1 month
  await user.save();
  await ctx.reply('تبریک! 🎉 اشتراک VIP برای ۱ ماه با ۱۰ امتیاز فعال شد!');
});
bot.action('referral_stats', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const referrals = await User.find({ referredBy: user.username });
  const completed = referrals.filter(r => r.joinDate).length;
  const vipReferrals = referrals.filter(r => r.userType === 'VIP').length;
  const pointsFromReferrals = completed * 1;
  const pointsFromVIP = vipReferrals * 3;
  const totalPoints = pointsFromReferrals + pointsFromVIP;
  const pointsSpent = user.points < totalPoints ? totalPoints - user.points : 0;
  const message = `
📊 آمار دعوت‌های تو:
- کل دعوت‌ها: ${referrals.length} نفر
- ثبت‌نام کامل‌شده: ${completed} نفر (+${pointsFromReferrals} امتیاز)
- اشتراک VIP: ${vipReferrals} نفر (+${pointsFromVIP} امتیاز)
- کل امتیازات کسب‌شده: ${totalPoints}
- امتیازات خرج‌شده: ${pointsSpent}
- امتیازات باقی‌مونده: ${user.points}

دوستات رو دعوت کن تا VIP بشی! 😍
لینکت: ${user.referralLink}
  `;
  await ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'دعوت از دوستان 🎉', callback_data: 'invite_friends' }],
      ],
    },
  });
});
bot.action('invite_friends', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const inviteText = `بیا به ربات ترید ما بپیوند و سیگنال‌های خفن با چارت و نقاط ورود/خروج بگیر! 🚀\nلینکم: ${user.referralLink}`;
  await ctx.reply(`لینک دعوتت: ${user.referralLink}\n\nاینو به دوستات بفرست:\n${inviteText}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ارسال به دوستان 📤', url: `https://t.me/share/url?url=${encodeURIComponent(inviteText)}` }],
      ],
    },
  });
});

// Handle messages
bot.on('message', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) return ctx.scene.enter('registration');
  if (ctx.session.waitingFor) {
    const type = ctx.session.waitingFor;
    if (type.startsWith('payment_')) {
      const months = parseInt(type.split('_')[1]);
      const payment = new Payment({
        userId: ctx.from.id,
        plan: `${months}-month`,
        proof: ctx.message.photo ? ctx.message.photo[0].file_id : ctx.message.text,
        createdAt: new Date(),
      });
      await payment.save();
      await ctx.reply('ممنون! مدرک پرداختیت ثبت شد. منتظر تأیید ادمین باش 📅');
      await bot.telegram.sendMessage('6949308046', `پرداخت جدید از ${user.username} برای ${months} ماه VIP. مدرک: ${payment.proof}`);
    } else if (['issue', 'complaint', 'suggestion'].includes(type)) {
      const feedback = new Feedback({
        userId: ctx.from.id,
        type,
        message: ctx.message.text,
        createdAt: new Date(),
      });
      await feedback.save();
      const responses = {
        issue: 'ممنون! مشکلت ثبت شد، تیم ما زود بررسی می‌کنه 🛠️',
        complaint: 'شکایتت ثبت شد! حتماً پیگیری می‌کنیم 😊',
        suggestion: 'مرسی از پیشنهادت! به تیممون فرستادم، خیلی خوبه 💡',
      };
      await ctx.reply(responses[type]);
      await bot.telegram.sendMessage('6949308046', `${type} از ${user.username}: ${ctx.message.text}`);
    } else if (type === 'admin_message') {
      await bot.telegram.sendMessage('6949308046', `پیام از ${user.username}: ${ctx.message.text}`);
      await ctx.reply('پیامت برای ادمین فرستاده شد! 😊');
    }
    ctx.session.waitingFor = null;
  }
});

// Admin commands
bot.command('upload_signal', async (ctx) => {
  if (ctx.from.id.toString() !== '6949308046') return;
  await ctx.reply('سیگنال جدید می‌خوای آپلود کنی؟ 📊\nعکس‌ها و متن سیگنال رو بفرست، بعد بگو برای کیه (Regular/VIP):');
  ctx.session.waitingFor = 'signal_upload';
});
bot.on('photo', async (ctx) => {
  if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === '6949308046') {
    ctx.session.signal = ctx.session.signal || { images: [], text: '', target: '' };
    ctx.session.signal.images.push(ctx.message.photo[0].file_id);
    await ctx.reply('عکس دریافت شد! 📸\nمی‌تونی عکس دیگه، متن، یا گروه هدف (Regular/VIP) رو بفرستی.');
  }
});
bot.on('text', async (ctx) => {
  if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === '6949308046') {
    if (['Regular', 'VIP'].includes(ctx.message.text)) {
      ctx.session.signal.target = ctx.message.text;
      const signal = new Signal({
        signalId: crypto.randomBytes(16).toString('hex'),
        images: ctx.session.signal.images,
        text: ctx.session.signal.text,
        target: ctx.session.signal.target,
        assignedUsers: [],
      });
      await signal.save();
      await distributeSignal(signal);
      await ctx.reply('سیگنال با موفقیت ذخیره و پخش شد! 🎉');
      ctx.session.signal = null;
      ctx.session.waitingFor = null;
    } else {
      ctx.session.signal.text = ctx.message.text;
      await ctx.reply('متن سیگنال دریافت شد! ✍️\nحالا بگو برای کیه (Regular یا VIP):');
    }
  }
});

// Distribute signals
async function distributeSignal(signal) {
  const users = await User.find({ userType: signal.target });
  const numSignals = signal.images.length;
  const groupSize = Math.ceil(users.length / numSignals);
  const groups = [];
  for (let i = 0; i < users.length; i += groupSize) {
    groups.push(users.slice(i, i + groupSize));
  }
  for (let i = 0; i < groups.length && i < numSignals; i++) {
    const image = signal.images[i % signal.images.length];
    for (const user of groups[i]) {
      await bot.telegram.sendPhoto(user.telegramId, image, { caption: signal.text });
      signal.assignedUsers.push({ telegramId: user.telegramId, sentAt: new Date() });
    }
  }
  await signal.save();
}

// Check VIP expiries
setInterval(async () => {
  const users = await User.find({ userType: 'VIP', vipExpiry: { $exists: true } });
  const now = new Date();
  for (const user of users) {
    const daysLeft = Math.ceil((user.vipExpiry - now) / (24 * 60 * 60 * 1000));
    if (daysLeft <= 3 && daysLeft > 0) {
      await bot.telegram.sendMessage(user.telegramId, `اشتراک VIP تو ${daysLeft} روز دیگه تموم می‌شه! 🕒\nبیا تمدید کن:`, {
        reply_markup: {
          inline_keyboard: [[{ text: 'تمدید اشتراک 🌟', callback_data: 'vip_subscription' }]],
        },
      });
    }
    if (daysLeft <= 0) {
      user.userType = 'Regular';
      user.vipExpiry = null;
      await user.save();
      await bot.telegram.sendMessage(user.telegramId, 'اشتراک VIP تو تموم شد! 😓 برای ادامه دسترسی، تمدید کن:', {
        reply_markup: {
          inline_keyboard: [[{ text: 'تمدید اشتراک 🌟', callback_data: 'vip_subscription' }]],
        },
      });
    }
  }
}, 24 * 60 * 60 * 1000); // Daily check

// Update active duration
setInterval(async () => {
  const users = await User.find({});
  for (const user of users) {
    user.activeDuration = Math.floor((new Date() - user.joinDate) / (24 * 60 * 60 * 1000));
    await user.save();
  }
}, 24 * 60 * 60 * 1000); // Daily update

// Start bot
bot.launch();
console.log('Bot running...');

// Webhook for Vercel
if (process.env.NODE_ENV === 'production') {
  bot.webhookCallback('/bot');
}