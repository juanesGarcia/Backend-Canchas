
const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const { SECRET } = require("../constants");

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: SECRET
};

module.exports = (passport) => {
    passport.use(
        new JwtStrategy(opts, (jwt_payload, done) => {
            return done(null, jwt_payload);
        })
    );
};