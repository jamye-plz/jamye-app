{
  description = "jamye-app mobile development environment";

  inputs = {
    # The user-created flake.lock records the exact nixpkgs-unstable revision.
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    {
      nixpkgs,
      ...
    }:
    let
      system = "aarch64-darwin";

      pkgs = import nixpkgs {
        inherit system;
      };

      # Re-import the same locked nixpkgs revision with Android-only policy.
      # License acceptance is declarative because a Nix store SDK is read-only;
      # neither setting leaks into the ordinary package set above.
      androidPkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };

      androidSdk = import ./nix/android-sdk.nix {
        inherit androidPkgs;
      };
    in
    {
      devShells.${system}.default = import ./nix/dev-shell.nix {
        inherit pkgs androidSdk;
      };
    };
}
