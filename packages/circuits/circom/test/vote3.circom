include "../vote.circom";

/*
  Due to a bug in MACI 1.0.2 that makes MACI.signUp function fail when tree depth is greater than 3,
  cream.signUpMaci fails if vote circuit is created w/ the MACI v1's hardcoded state/message tree
  depths 10. As a workaround, vote circuit is created w/ level 3.  When the bug is fixed, level-10
  vote circuit should be created instead.
*/
component main = Vote(3);