/**
 * Passtastic v0.2
 * 
 * Author: Benjamin Stuermer
 * 
 * A deterministic password generator.
 */
(function(window, $, undefined){
  "use strict";
  
  var BCRYPT_WORK_PARAM = '12';
  var BCRYPT_VERSION = '2a'; //TODO: See if a bcrypt implementation using 2y exists
  var BCRYPT_BIN_LEN = 184; //The number of bits of entropy generated by bcrypt
  
  var CHAR_ARRAY_LEN = 256; //The length of the character arrays from which the password's characters are drawn
  
  /**
   * String containing all characters used in bcrypt's base 64 schema, arranged in order
   * of ordinality (so . == 0, / == 1, A == 2, etc). This allows us to use indexOf() to get
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
     * input is simply the three strings concatenated in that order, the salt is the MD5 hash of
     * the same three concatenated strings, converted into base64 to decrease the possibility of
     * salt collisions.
     * - Sixteen arrays are generated (note that the order must be identical to this implementation
     * or the result will differ!). The first consists only of lower-case characters, the second of
     * upper-case, the third of digits and the fourth of special characters. The remaining eight arrays
     * are constructed from characters of all four classes. Each array is 256 characters long.
     * - NOTE: For the above step, the user is given the option to generate the password without any
     * special characters. If this option is selected, only upper case, lower case chars and numbers
     * are used.
     * - The bcrypt hash is used as a source of entropy for the rest of the algorithm. Bcrypt
     * generates 184 bits of entropy. Bits are consumed from the most-significant end (from left to right).
     * - The first 49 bits are used to shuffle the 16 character arrays by treating the collection of arrays
     * as a binary tree. (Note that this wastes bits, we treat them as consumed anyhow)
     * - One character is picked from each of the shuffled arrays, and the characters are concatenated to
     * create the password. This step consumes 128 of the remaining 135 bits of entropy.
     *
     * @param string site 
     * @param string userName,
     * @param string masterPw
     * @param bool useSpecialChars - If true, the generated password will contain 1 or more special characters
     * @param function resultCallback - passed the generated password
     * @param function progress - Optional, called periodically (approx. 100 times) during hash generation.
     */
    getPassword : function(site, userName, masterPw, useSpecialChars, resultCallback, progress) {
      var self = this,
      bcrypt = new bCrypt();
      
      bcrypt.hashpw(site + userName + masterPw,
      
                    '$'+BCRYPT_VERSION+'$'+BCRYPT_WORK_PARAM+'$'+self._generateSalt(site+userName+masterPw),
      
                    //Callback that is passed the result of the function
                    function (bcryptHash) {
                      var password, //The generated password
                          binaryHash; //The BCrypt hash in binary format. We convert into this format because we only use a few
                                      // bits of the output at a time, and it's easier to just chop off used bits than to recalculate
                                      // a base64 string.

                      bcryptHash = bcryptHash.substr(29); //We retrieve only the hash portion of the output.

                      if(bcryptHash.length != 31) //Sanity check
                        throw('Passtastic.getPassword() - The bcrypt hash output should always be exactly 31 characters long, but it was found to be ' + bcryptHash.length + ' chars long!');

                      binaryHash = self._bcryptBase64ToBinary(bcryptHash);
                      password = self._convertBinaryToPw(binaryHash, useSpecialChars);
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
    _bcryptBase64ToBinary : function(base64) {
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
     * and converted into a bcrypt-style base64 representation.
     * 
     * @param str - The input string
     * @return string
     */
    _generateSalt : function(str) {
      return this._binaryToBase64(this._hexToBinary(calcMD5(str)));
    },
    
    /**
     * Converts a binary string into a bcrypt-style base64 string. The binary
     * string is expected to contain 6*N characters, simply because this function
     * is intended to take an MD5 value and special handling would be needed for
     * strings with other lengths.
     * 
     * @param bin - String
     * @return string
     */
    _binaryToBase64 : function(bin) {
      var result = ''; //The current block of the binary string with which we are working
      
      while(bin.length) {
        var binVal = bin.slice(0, 6);
        result += BCRYPT_BASE64_VALS.charAt(parseInt(binVal, 2));
        
        bin = bin.substring(6);
      }
      
      return result;
    },
    
    /**
     * Converts a hex string into a binary string
     * 
     * @param hex - String
     * @return string
     */
    _hexToBinary : function(hex) {
      var result = '',
          binaryChar, //binary representation of a single character
          charVal; //Numeric value of a single character
          
      for(var i = 0; i < hex.length; i++) {
        charVal = parseInt(hex.charAt(i), 16);
        
        binaryChar = charVal.toString(2);

        //Pad the binary representation out so that each character generates a 4-bit chunk
        binaryChar = '0000'.substring(0, 6 - binaryChar.length) + binaryChar;

        result += binaryChar;
      }      
      
      return result;
    },
    
    /**
     * Converts a binary string into a password. For specifics on the algorithm used,
     * see the doc comment for getPassword().
     * 
     * @param binary - A 184-bit binary string
     * @param useSpecialChars bool, if true, the generated password will contain at least one special character
     * 
     * @return A 16-character password string containing lower-case and upper-case characters,
     *         digits and special characters. At least one of each is guaranteed to be in the
     *         password.
     */
    _convertBinaryToPw : function(binary, useSpecialChars) {
      if(binary.length != BCRYPT_BIN_LEN) //sanity check
        throw('Passtastic._convertBinaryToPw() - The passed binary string is not ' + BCRYPT_BIN_LEN + ' characters long. It is ' + binary.length + ' characters long.');
      
      var password = '';
      
      //Step 1: Construct our 16 arrays of characters (ie, strings)
      var charArrays = this._getStandardCharArrays(useSpecialChars);
      
      //Step 2: shuffle the strings using the first 49 bits of the binary string
      charArrays = this._shuffle(charArrays, binary.slice(0, 49));
      
      //Step 3: Use the rest of the binary string as the address of one character from each string
      var blockSize = this._getRequiredBits(CHAR_ARRAY_LEN),
          charPosition,
          charPosBinary,
          sliceStart, sliceEnd;
      for(var i = 0; i < charArrays.length; i++) {
        sliceStart = 50 + i*blockSize;
        sliceEnd = sliceStart + blockSize;
        charPosBinary = binary.slice(sliceStart, sliceEnd);
        charPosition = parseInt(charPosBinary, 2);
        password += charArrays[i].charAt(charPosition);
      }
      
      return password;
    },
    
    /**
     * Generates a collection of 16 strings that are used to generate a password
     * 
     * @param useSpecialChars bool - If true, one of the arrays will consist only
     *        of special characters, and the arrays that are not limited to a single
     *        class of character will include special characters.
     */
    _getStandardCharArrays : function(useSpecialChars) {
      var charArrays = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
      
      while(charArrays[0].length < CHAR_ARRAY_LEN) //First array - lower-case characters
        charArrays[0] += LOWER_CASE_CHARS;
      while(charArrays[1].length < CHAR_ARRAY_LEN) //Second array - upper-case characters
        charArrays[1] += UPPER_CASE_CHARS;
      while(charArrays[2].length < CHAR_ARRAY_LEN) //Third array - digits
        charArrays[2] += NUMERICAL_CHARS;
      
      charArrays[0] = charArrays[0].substring(0, CHAR_ARRAY_LEN);
      charArrays[1] = charArrays[1].substring(0, CHAR_ARRAY_LEN);
      charArrays[2] = charArrays[2].substring(0, CHAR_ARRAY_LEN);
      
      if(useSpecialChars) {
        while(charArrays[3].length < CHAR_ARRAY_LEN) { //Fourth array - special chars
          charArrays[3] += SPECIAL_CHARS;
        }
        charArrays[3] = charArrays[3].substring(0, CHAR_ARRAY_LEN);
      }
      
      //All remaining arrays contain all characters, inserted cyclically
      var allChars = LOWER_CASE_CHARS + UPPER_CASE_CHARS + NUMERICAL_CHARS + (useSpecialChars ? SPECIAL_CHARS : ''),
          curStrIdx = useSpecialChars ? 4 : 3,
          curCharIdx = 0;
      for(; curStrIdx < charArrays.length && charArrays[curStrIdx].length < CHAR_ARRAY_LEN; curStrIdx++) {
        for(; charArrays[curStrIdx].length < CHAR_ARRAY_LEN; curCharIdx++) {
          if(curCharIdx > allChars.length)
            curCharIdx = 0;
          
          charArrays[curStrIdx] += allChars.charAt(curCharIdx);
        }
      }
      
      return charArrays;
    },
    
    /**
     * Shuffles a 16-member array via binary-tree selection using a binary string
     * as an entropy source.
     * 
     * The shuffle is performed by repeatedly dividing the array in half. If the next
     * bit in the binary string is a 0, the half with lower indices is kept, if 1 then
     * the higher half is kept. For an odd number of members, the middle member is put
     * in the lower half. Whenever the number of remaining array members is 1, that
     * item is removed from the source array and pushed onto the shuffled array.
     * 
     * For rounds which are not powers of two, the number of bits required to search the
     * next highest power of two is always consumed by the round, even if they are not all
     * actually used. EG, since the maximum number of bits that could be required to get
     * a single member from a 15-member array is 4, we consume 4 bits in selecting one
     * even if only 3 of those bits end up being used.
     */
    _shuffle : function(items, binary) {
      var shuffledItems = [],
          stagingArray, //Used to stage the arrays while selecting one
          binaryBlock, //block of bits used to retrieve each member of the passed array
          blockPos = 0, //index from which to retrieve the next "binaryBlock" from "binary"
          bit, //Stores single bits from the binary string
          bitPos, //Index from which to retrieve the next "bit" from "binaryBlock"
          middle,//The middle of the staging array, used to set where we splice from
          blockSize; //The size in bits of the current binaryBlock
      
      while(items.length) {
        stagingArray = items.slice(0); //Copy the arrays into a staging array - we'll remove items from the staging array until only one is left
        blockSize = this._getRequiredBits(items.length);
        binaryBlock = binary.slice(blockPos, blockPos + blockSize); // We always slice the maximum bits we could require from the binary string to
                                                                    // ensure that we always consume the same number of bits for each array.
        blockPos += blockSize;
        
        bitPos = 0;        
        while(stagingArray.length > 1) {
          bit = binaryBlock.charAt(bitPos++);
          middle = Math.ceil(stagingArray.length/2);
          if(bit == '1')
            stagingArray.splice(0, middle); //Remove the lower half
          else if(bit == '0')
            stagingArray.splice(middle); //Remove the upper half
          else if(bit == '')
            throw('Passtastic._shuffle() - There is an error in the logic in this function. We seem to have run out of bits before we could select an item.');
          else
            throw('Passtastic._shuffle() - The passed binary string is invalid. It contains the character "'+bit+'", which is not a 0 or 1.');
        }
        
        items.splice(items.indexOf(stagingArray[0]), 1);
        shuffledItems.push(stagingArray[0]);
      }
      
      return shuffledItems;
    },
    
    /**
     * Gets the number of bits required to represent an address in a block of some
     * length. Essentially this returns the ceiling of log2(length).
     * 
     * @param length integer
     */
    _getRequiredBits : function(length) {
      if(!length)
        throw('Passtastic._getRequiredBits() - Invalid length parameter.');
      
      var i = 0, maxBits = 1;
      while(++i < 10) {
        maxBits*=2;
        if(maxBits >= length)
          return i;
      }
      
      throw('Passtastic._getRequiredBits() - You passed a length requiring more than 10 bits. This function should be rewritten to use log functions if you want to use it for larger numbers.');
    }
  };
})(window, jQuery);