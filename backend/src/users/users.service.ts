import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.users.findOne({ where: { username } });
  }

  /** Same as findByUsername but includes the (normally hidden) password hash. */
  findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  create(username: string, passwordHash: string): Promise<User> {
    const user = this.users.create({ username, passwordHash });
    return this.users.save(user);
  }
}
