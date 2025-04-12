require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Admin ID and Wallet Address
const ADMIN_ID = '6949308046';
const WALLET_ADDRESS = '0x9aBfd1c9C4Fa9e09d871371cC84c9d48837952fe';

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

// Function to check if user is fully registered
async function checkRegistration(ctx, callback) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user || !user.joinDate) {
    await ctx.reply('شما هنوز ثبت‌نام نکردی! 😓 لطفاً اول ثبت‌نام کن تا بتونی از این بخش استفاده کنی:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ثبت‌نام کن 🚀', callback_data: 'restart_registration' }],
        ],
      },
    });
    return false;
  }
  await callback(ctx);
  return true;
}

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
    if (!ctx.message || !ctx.message.text) {
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
    if (!ctx.message || !ctx.message.text) {
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
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('لطفاً شماره تماست رو به صورت متن بفرست! 😊');
      return;
    }
    const phone = ctx.message.text.replace(/\D/g, '');
    if (phone !== ctx.from.id.toString()) { // Simplified check
      await ctx.reply('شماره تماس باید با حساب تلگرامت مطابقت داشته باشه! 😓');
      return ctx.scene.leave();
    }
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) {
      await ctx.reply('یه مشکلی پیش اومد، لطفاً دوباره امتحان کن! 😓');
      return ctx.scene.leave();
    }
    user.name = ctx.wizard.state.name;
    user.surname = ctx.wizard.state.surname;
    user.phone = phone;
    user.joinDate = new Date();
    const hash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
    user.username = `DExtrading_${hash}`;
    user.referralLink = `t.me/${ctx.botInfo.username}?start=${user.username}`;
    user.ipAddress = ctx.message.from.ip || 'unknown';
    user.referredBy = ctx.session.referredBy || null;
    await user.save();
    await ctx.reply(`ثبت‌نام با موفقیت انجام شد! 🎉\nیوزرنیم تو: ${user.username}\nلطفاً به کانالم بپیوند: @TradingSignals`, {
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
  await ctx.reply('ثبت‌نام لغو شد! 😊 می‌تونی از منوی زیر استفاده کنی:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ارتباط با ادمین 📞', callback_data: 'contact_admin' }],
        [{ text: 'گزارش مشکل 🛠️', callback_data: 'report_issue' }],
        [{ text: 'ثبت شکایت 😡', callback_data: 'submit_complaint' }],
        [{ text: 'ارسال پیشنهاد 💡', callback_data: 'send_suggestion' }],
        [{ text: 'دوباره ثبت‌نام کن 🚀', callback_data: 'restart_registration' }],
      ],
    },
  });
  return ctx.scene.leave();
});
bot.action('restart_registration', async (ctx) => {
  return ctx.scene.enter('registration');
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
  let user = await User.findOne({ telegramId: ctx.from.id });
  const referral = ctx.startPayload;
  if (referral) ctx.session.referredBy = referral;
  if (!user) {
    // Create a temporary user entry to allow access to menu
    user = new User({
      telegramId: ctx.from.id,
      userType: 'Regular',
    });
    await user.save();
    await ctx.reply('سلام خوش اومدی! 😍 بیا با هم ثبت‌نام کنیم! 🚀');
    return ctx.scene.enter('registration');
  }
  if (!user.joinDate) {
    await ctx.reply(`سلام ${user.name || 'دوست عزیز'}! 😍 به نظر می‌رسه هنوز ثبت‌نام نکردی. بیا ثبت‌نام کنیم! 🚀`);
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
  await ctx.reply(`سلام ${user.name || 'دوست عزیز'}! 😊 چیکار می‌خوای بکنی؟`, { reply_markup: keyboard });
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
  await checkRegistration(ctx, async (ctx) => {
    const keyboard = {
      inline_keyboard: [
        [{ text: '۱ ماهه (۲۹ دلار)', callback_data: 'vip_1month' }],
        [{ text: '۳ ماهه (۷۸ دلار)', callback_data: 'vip_3month' }],
        [{ text: '۶ ماهه (۱۴۸ دلار)', callback_data: 'vip_6month' }],
        [{ text: '۱۲ ماهه (۲۷۸ دلار)', callback_data: 'vip_12month' }],
        [{ text: 'استفاده از امتیازات 🌟', callback_data: 'redeem_points' }],
      ],
    };
    await ctx.reply('یه پلن VIP انتخاب کن:\n۱ ماهه: ۲۹ دلار\n۳ ماهه: ۷۸ دلار\n۶ ماهه: ۱۴۸ دلار\n۱۲ ماهه: ۲۷۸ دلار', { reply_markup: keyboard });
  });
});
bot.action(/vip_(\d+)month/, async (ctx) => {
  const months = parseInt(ctx.match[1]);
  const prices = {
    '1': 29,
    '3': 78,
    '6': 148,
    '12': 278,
  };
  const price = prices[months];
  await ctx.reply(`لطفاً مبلغ ${price} دلار رو به این آدرس ولت واریز کن:\n${WALLET_ADDRESS}\nبعد از واریز، رسید واریزی رو بفرست: 📸`);
  ctx.session.waitingFor = `payment_${months}`;
});
bot.action('redeem_points', async (ctx) => {
  await checkRegistration(ctx, async (ctx) => {
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
});
bot.action('referral_stats', async (ctx) => {
  await checkRegistration(ctx, async (ctx) => {
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
});
bot.action('invite_friends', async (ctx) => {
  await checkRegistration(ctx, async (ctx) => {
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
});

// Handle messages
bot.on('message', async (ctx) => {
  let user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) {
    user = new User({
      telegramId: ctx.from.id,
      userType: 'Regular',
    });
    await user.save();
    await ctx.reply('سلام خوش اومدی! 😍 بیا با هم ثبت‌نام کنیم! 🚀');
    return ctx.scene.enter('registration');
  }
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
      await ctx.reply('ممنون! رسید واریزیت ثبت شد. منتظر تأیید ادمین باش 📅');
      const userInfo = `نام: ${user.name || 'نامشخص'}\nفامیلی: ${user.surname || 'نامشخص'}\nشماره تماس: ${user.phone || 'نامشخص'}\nیوزرنیم: ${user.username || 'نامشخص'}`;
      await bot.telegram.sendMessage(ADMIN_ID, `پرداخت جدید از ${user.username || 'کاربر بدون نام'} برای ${months} ماه VIP.\nاطلاعات کاربر:\n${userInfo}\nرسید: ${payment.proof}`);
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
      await bot.telegram.sendMessage(ADMIN_ID, `${type} از ${user.username || 'کاربر بدون نام'}: ${ctx.message.text}`);
    } else if (type === 'admin_message') {
      await bot.telegram.sendMessage(ADMIN_ID, `پیام از ${user.username || 'کاربر بدون نام'}: ${ctx.message.text}`);
      await ctx.reply('پیامت برای ادمین فرستاده شد! 😊');
    }
    ctx.session.waitingFor = null;
  }
});

// Admin commands
bot.command('upload_signal', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await ctx.reply('سیگنال جدید می‌خوای آپلود کنی؟ 📊\nعکس‌ها و متن سیگنال رو بفرست، بعد بگو برای کیه (Regular/VIP):');
  ctx.session.waitingFor = 'signal_upload';
});
bot.on('photo', async (ctx) => {
  if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === ADMIN_ID) {
    ctx.session.signal = ctx.session.signal || { images: [], text: '', target: '' };
    ctx.session.signal.images.push(ctx.message.photo[0].file_id);
    await ctx.reply('عکس دریافت شد! 📸\nمی‌تونی عکس دیگه، متن، یا گروه هدف (Regular/VIP) رو بفرستی.');
  }
});
bot.on('text', async (ctx) => {
  if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === ADMIN_ID) {
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

// Start bot only in local environment
if (process.env.NODE_ENV !== 'production') {
  bot.launch();
  console.log('Bot running locally...');
}