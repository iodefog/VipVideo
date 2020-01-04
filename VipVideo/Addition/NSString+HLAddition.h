//
//  NSString+HLAddition.h
//  VipVideo
//
//  Created by 李红力 on 2020/1/4.
//  Copyright © 2020 SV. All rights reserved.
//

#import <AppKit/AppKit.h>


#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface NSString (HLAddition)

+ (NSString *)compareCurrentTime:(NSDate *)compareDate;

/**
 *  URLEncode
 */
- (NSString *)URLEncodedString;

/**
 *  URLDecode
 */
-(NSString *)URLDecodedString;
@end

NS_ASSUME_NONNULL_END
