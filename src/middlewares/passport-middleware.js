const passport = require('passport');
const { Strategy, ExtractJwt } = require('passport-jwt');
const { SECRET } = require('../constants');
const db = require('../constants/db');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: SECRET,
};

passport.use(new Strategy(options, async (payload, done) => {
  try {
    const { rows } = await db.query('SELECT id, email FROM users WHERE id = $1', [payload.id]);
    if (!rows.length) {
      return done(null, false);
    }
    const user = {
      id: rows[0].id,
      email: rows[0].email,
    };
    return done(null, user);
  } catch (error) {
    console.error(error);
    return done(error, false);
  }
}));

module.exports = passport;
