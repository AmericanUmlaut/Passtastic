/**
 * Passtastic v0.1
 * 
 * Author: Benjamin Stuermer
 * 
 * A deterministic password generator.
 */
(function(window, $, undefined){
  "use strict";
  
  var BCRYPT_WORK_PARAM = '10';
  var BCRYPT_VERSION = '2a'; //TODO: See if a bcrypt implementation using 2y exists
  var BCRYPT_BIN_LEN = 184; //The number of bits of entropy generated by bcrypt
  
  var CHAR_ARRAY_LEN = 256; //The length of the character arrays from which the password's characters are drawn
  
  /**
   * String containing all characters used in bcrypt's base 64 schema, arranged in order
   * of ordinality (so . == 0, / == 1, A == 2, etc). This allows us to use indexOf() to grab
   * the value of a digit.
   */
  var BCRYPT_BASE64_VALS = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
  var LOWER_CASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
  var UPPER_CASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var NUMERICAL_CHARS = '0123456789';
  var SPECIAL_CHARS = '!"#$%&\'()*+,-./:;<=>?@[/]^_`{|}~'; // -> The 32 non-whitespace ASCII characters between 33 and 126
   
  window.Passtastic = {
    /**
     * Deterministically generates a password based on three strings.
     * 
     * The algorithm (roughly): (TODO: formal documentation of the algorithm) 
     * - The strings site, userName and masterPw are hashed using bcrypt. The hash
     * input is simply the three string concatenated in that order, the salt is the MD5 hash of
     * the site concatenated with the userName (converted into base64).
     * - Sixteen arrays are generated (note that the order must be identical to this implementation
     * or the result will differ!). The first consists only of lower-case characters, the second of
     * upper-case, the third of digits and the fourth of special characters. The remaining eight arrays
     * are constructed from characters of all four classes. Each array is 256 characters long.
     * - The bcrypt hash is used as a source of entropy for the rest of the algorithm. Bcrypt
     * generates 184 bits of entropy. Bits are consumed from the most-significant end (from left to right).
     * - The first 49 bits are used to shuffle the 16 character arrays by treating the collection of arrays
     * as a binary tree. (Note that this wastes bits, we treat them as consumed anyhow)
     * - One character is picked from each of the shuffled arrays, and the characters are concatenated to
     * create the password. This step consumes 128 of the remaining 135 bits of entropy.
     * - Just for fun, and to use up the last 7 bits, we count the number of 1s in the remaining string.
     * If it is odd, we reverse the order of the output password. (We count 1s intentionally to be forgiving
     * of implementations that don't take into account that the last character of a bcrypt output only encodes
     * 4 bits rather than 6).
     *
     * @param string site 
     */
    getPassword : function(site, userName, masterPw, resultCallback, progress) {
      var self = this,
      bcrypt = new bCrypt();
      
      bcrypt.hashpw(site + userName + masterPw,
      
                    '$'+BCRYPT_VERSION+'$'+BCRYPT_WORK_PARAM+'$'+self._generateSalt(site+userName),
      
                    //Callback that is passed the result of the function
                    function (bcryptHash) {
                      var password, //The generated password
                          binaryHash; //The BCrypt hash in binary format. We convert into this format because we only use a few
                                      // bits of the output at a time, and it's easier to just chop off used bits than to recalculate
                                      // a base64 string.

                      bcryptHash = bcryptHash.substr(29); //We retrieve only the hash portion of the output.

                      if(bcryptHash.length != 31) //Sanity check
                        throw('Passtastic.getPassword() - The bcrypt hash output should always be exactly 31 characters long, but it was found to be ' + bcryptHash.length + ' chars long!');

                      binaryHash = self.bcryptBase64ToBinary(bcryptHash);
                      password = self._convertBinaryToPw(binaryHash);
                      resultCallback(password);
                    },
                    
                    //Callback that is called periodically as the hash is generated 
                    progress);
    },
    
    /**
     * Converts a bcrypt-style base64 string into a binary string
     * 
     * @param base64 A bcrypt-style base64 string
     *
     * @return string
     */
    bcryptBase64ToBinary : function(base64) {
      var result = '',
          binaryChar, //binary representation of a single character
          charVal; //Numeric value of a single character
      for(var i = 0; i < base64.length; i++) {
        charVal = BCRYPT_BASE64_VALS.indexOf(base64.charAt(i));
        
        if(-1 == charVal)
          throw('Passtastic.base64ToBinary() - passed string is not a valid base64 string');
        
        binaryChar = charVal.toString(2);

        //Pad the binary representation out so that each character generates a 6-bit chunk
        binaryChar = '000000'.substring(0, 6 - binaryChar.length) + binaryChar;

        result += binaryChar;
      }
      
      //We trim the last two chars from the 186-long string because the last character
      // of a bcrypt output only encodes 4 bits. The last two bits are always 0.
      return result.substring(0, BCRYPT_BIN_LEN);
    },
    
    /**
     * Generates a bcrypt salt based on a string. The MD5 hash of the string is generated,
     * and converted into base64.
     */
    _generateSalt : function(str) {
      var salt = 'b0MHMsT3ErLoTRjpjzsCie';
      //TODO: do something here instead of just returning a hard-coded string
      return salt;
    },
    
    /**
     * Converts a binary string into a password. For specifics on the algorithm used,
     * see the doc comment for getPassword().
     * 
     * @param binary - A 184-bit binary string
     * 
     * @return A 16-character password string containing lower-case and upper-case characters,
     *         digits and special characters. At least one of each is guaranteed to be in the
     *         password.
     */
    _convertBinaryToPw : function(binary) {
      if(binary.length != BCRYPT_BIN_LEN) //sanity check
        throw('Passtastic._convertBinaryToPw() - The passed binary string is not ' + BCRYPT_BIN_LEN + ' characters long. It is ' + binary.length + ' characters long.');
      
      //Step 1: Construct our 16 arrays of characters (ie, strings)
      var charArrays = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
      while(charArrays[0].length < CHAR_ARRAY_LEN) //First array - lower-case characters
        charArrays[0] += LOWER_CASE_CHARS;
      while(charArrays[1].length < CHAR_ARRAY_LEN) //Second array - upper-case characters
        charArrays[1] += UPPER_CASE_CHARS;
      while(charArrays[2].length < CHAR_ARRAY_LEN) //Third array - digits
        charArrays[2] += NUMERICAL_CHARS;
      while(charArrays[3].length < CHAR_ARRAY_LEN) //Fourth array - special chars
        charArrays[3] += SPECIAL_CHARS;
      
      charArrays[0] = charArrays[0].substring(0, CHAR_ARRAY_LEN);
      charArrays[1] = charArrays[1].substring(0, CHAR_ARRAY_LEN);
      charArrays[2] = charArrays[2].substring(0, CHAR_ARRAY_LEN);
      charArrays[3] = charArrays[3].substring(0, CHAR_ARRAY_LEN);
      
      //All 12 remaining arrays contain all characters, inserted cyclically
      var allChars = LOWER_CASE_CHARS + UPPER_CASE_CHARS + NUMERICAL_CHARS + SPECIAL_CHARS,
          curStrIdx = 4,
          curCharIdx = 0;
      for(; curStrIdx < charArrays.length && charArrays[curStrIdx].length < CHAR_ARRAY_LEN; curStrIdx++) {
        for(; charArrays[curStrIdx].length < CHAR_ARRAY_LEN; curCharIdx++) {
          charArrays[curStrIdx] += allChars.charAt(curCharIdx);
          
          if(curCharIdx == allChars.length)
            curCharIdx = 0;
        }
      }
       //TODO: The loop seems to exclude the lower-case "a" character for some reason. Probably just a FireBug output error.
    }
  };
})(window, jQuery);