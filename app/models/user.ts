import mongoose, { Schema, Document } from 'mongoose';

export interface User extends Document {
  _id: number;
}

const schema = new Schema({
  _id: Number
});

const UserModel = mongoose.model<User>('user', schema);

export default UserModel;
