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
    await ctx.reply('Please enter your name:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send your name as text.');
    ctx.wizard.state.name = ctx.message.text;
    await ctx.reply('Please enter your surname:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send your surname as text.');
    ctx.wizard.state.surname = ctx.message.text;
    await ctx.reply('Please send your phone number (e.g., 989399042848):');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a valid phone number.');
    const phone = ctx.message.text.replace(/\D/g, '');
    if (phone !== ctx.from.id.toString()) { // Simplified check
      await ctx.reply('Phone number must match your Telegram account.');
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
    await ctx.reply(`Registration complete! Your username: ${username}\nPlease join our channel: @TradingSignals`);
    return ctx.scene.leave();
  }
);

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
    await ctx.reply('Welcome! Let’s register you.');
    return ctx.scene.enter('registration');
  }
  await showMainMenu(ctx);
});

// Main menu
async function showMainMenu(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const keyboard = {
    inline_keyboard: [
      [{ text: 'Contact Admin', callback_data: 'contact_admin' }],
      [{ text: 'Report Issue', callback_data: 'report_issue' }],
      [{ text: 'Submit Complaint', callback_data: 'submit_complaint' }],
      [{ text: 'Send Suggestion', callback_data: 'send_suggestion' }],
      [{ text: 'VIP Subscription', callback_data: 'vip_subscription' }],
      [{ text: 'Referral Stats', callback_data: 'referral_stats' }],
      [{ text: 'Invite Friends', callback_data: 'invite_friends' }],
    ],
  };
  await ctx.reply(`Hello ${user.name}! What would you like to do?`, { reply_markup: keyboard });
}

// Handle callbacks
bot.action('contact_admin', async (ctx) => {
  await ctx.reply('Please send your message to the admin:');
  ctx.session.waitingFor = 'admin_message';
});
bot.action('report_issue', async (ctx) => {
  await ctx.reply('Please describe the issue:');
  ctx.session.waitingFor = 'issue';
});
bot.action('submit_complaint', async (ctx) => {
  await ctx.reply('Please describe your complaint:');
  ctx.session.waitingFor = 'complaint';
});
bot.action('send_suggestion', async (ctx) => {
  await ctx.reply('Please share your suggestion:');
  ctx.session.waitingFor = 'suggestion';
});
bot.action('vip_subscription', async (ctx) => {
  const keyboard = {
    inline_keyboard: [
      [{ text: '1 Month', callback_data: 'vip_1month' }],
      [{ text: '3 Months', callback_data: 'vip_3month' }],
      [{ text: '6 Months', callback_data: 'vip_6month' }],
      [{ text: '12 Months', callback_data: 'vip_12month' }],
      [{ text: 'Redeem Points', callback_data: 'redeem_points' }],
    ],
  };
  await ctx.reply('Choose a VIP plan (costs are example):\n1 Month: $10\n3 Months: $25\n6 Months: $45\n12 Months: $80', { reply_markup: keyboard });
});
bot.action(/vip_(\d+)month/, async (ctx) => {
  const months = parseInt(ctx.match[1]);
  await ctx.reply('Please send payment proof (e.g., screenshot).');
  ctx.session.waitingFor = `payment_${months}`;
});
bot.action('redeem_points', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (user.points < 10) { // Example: 10 points for 1 month
    await ctx.reply('Not enough points! You need 10 points for 1 month VIP.');
    return;
  }
  user.points -= 10;
  user.userType = 'VIP';
  user.vipExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 1 month
  await user.save();
  await ctx.reply('VIP activated for 1 month using 10 points!');
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
Your Referral Stats:
- Total Referrals: ${referrals.length}
- Completed Registrations: ${completed} (+${pointsFromReferrals} points)
- VIP Subscriptions: ${vipReferrals} (+${pointsFromVIP} points)
- Total Points Earned: ${totalPoints}
- Points Spent: ${pointsSpent}
- Points Remaining: ${user.points}

Keep inviting to earn more VIP time!
Invite: ${user.referralLink}
  `;
  await ctx.reply(message);
});
bot.action('invite_friends', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const inviteText = `Join our trading bot for exclusive signals with charts, entry points, and 3 exit targets! Use my link: ${user.referralLink}`;
  await ctx.reply(`Your invite link: ${user.referralLink}\n\nShare this:\n${inviteText}`);
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
      await ctx.reply('Payment proof submitted. Waiting for admin approval.');
      await bot.telegram.sendMessage('6949308046', `New payment from ${user.username} for ${months}-month VIP. Proof: ${payment.proof}`);
    } else if (['issue', 'complaint', 'suggestion'].includes(type)) {
      const feedback = new Feedback({
        userId: ctx.from.id,
        type,
        message: ctx.message.text,
        createdAt: new Date(),
      });
      await feedback.save();
      const responses = {
        issue: 'Your issue has been registered. Our team will review it soon.',
        complaint: 'Your complaint has been registered. We’ll address it promptly.',
        suggestion: 'Thank you for your suggestion! It’s been forwarded to our team.',
      };
      await ctx.reply(responses[type]);
      await bot.telegram.sendMessage('6949308046', `${type} from ${user.username}: ${ctx.message.text}`);
    } else if (type === 'admin_message') {
      await bot.telegram.sendMessage('6949308046', `Message from ${user.username}: ${ctx.message.text}`);
      await ctx.reply('Your message has been sent to the admin.');
    }
    ctx.session.waitingFor = null;
  }
});

// Admin commands
bot.command('upload_signal', async (ctx) => {
  if (ctx.from.id.toString() !== '6949308046') return;
  await ctx.reply('Please send images and text for the signal, and specify target (Regular/VIP).');
  ctx.session.waitingFor = 'signal_upload';
});
bot.on('photo', async (ctx) => {
  if (ctx.session.waitingFor === 'signal_upload' && ctx.from.id.toString() === '6949308046') {
    ctx.session.signal = ctx.session.signal || { images: [], text: '', target: '' };
    ctx.session.signal.images.push(ctx.message.photo[0].file_id);
    await ctx.reply('Image received. Send more images, text, or target (Regular/VIP).');
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
      await ctx.reply('Signal saved and distributed.');
      ctx.session.signal = null;
      ctx.session.waitingFor = null;
    } else {
      ctx.session.signal.text = ctx.message.text;
      await ctx.reply('Text received. Send target (Regular/VIP) to complete.');
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
      await bot.telegram.sendMessage(user.telegramId, `Your VIP subscription expires in ${daysLeft} days! Renew here:`, {
        reply_markup: {
          inline_keyboard: [[{ text: 'Renew VIP', callback_data: 'vip_subscription' }]],
        },
      });
    }
    if (daysLeft <= 0) {
      user.userType = 'Regular';
      user.vipExpiry = null;
      await user.save();
      await bot.telegram.sendMessage(user.telegramId, 'Your VIP subscription has expired. Renew to continue access.');
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