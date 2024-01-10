// async function findOrCreateUser(userId: string): Promise<IUser> {
//   let user = await UserModel.findOne({ userId: userId }).exec();

//   if (!user) {
//       user = new UserModel({ userId: userId });
//       await user.save();
//   }

//   return user;
// }
